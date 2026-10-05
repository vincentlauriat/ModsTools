// Pure logic of ci-watch: reading `git push` command lines, GitHub remotes and `gh run list --json` output.

export const RUN_FIELDS = 'databaseId,name,status,conclusion,url,workflowName'

export type Run = {
  databaseId: number
  name: string
  workflowName: string
  status: string
  conclusion: string
  url: string
}

export type Push = {
  // `cd` targets and `git -C` folders in the order the shell applies them, relative to the session folder.
  dirs: string[]
  // The remote named on the command line (`git push upstream …`), if any.
  remote: string | null
}

type Token = { text: string; expands: boolean }

const PREFIXES = new Set(['rtk', 'env', 'time', 'command', 'exec', 'nohup'])

// Splits a shell command into simple commands (on unquoted && || ; | & and newlines) of words, quotes removed.
// A word that holds an unquoted or double-quoted `$` or a backquote is marked: its value is the shell's, not ours.
export function simpleCommands(command: string): Token[][] {
  const commands: Token[][] = [[]]
  let word: Token | null = null
  let quote: '"' | "'" | null = null
  let redirect = false
  const push = () => {
    if (word !== null && redirect) redirect = false
    else if (word !== null) commands[commands.length - 1]!.push(word)
    word = null
  }
  const add = (ch: string, expands = false) => {
    word ??= { text: '', expands: false }
    word.text += ch
    if (expands) word.expands = true
  }
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]!
    if (quote === "'") {
      if (ch === "'") quote = null
      else add(ch)
    } else if (quote === '"') {
      if (ch === '"') quote = null
      else if (ch === '\\' && i + 1 < command.length) add(command[++i]!)
      else add(ch, ch === '$' || ch === '`')
    } else if (ch === "'" || ch === '"') {
      quote = ch
      word ??= { text: '', expands: false }
    } else if (ch === '\\' && i + 1 < command.length) {
      if (command[i + 1] === '\n') i += 1
      else add(command[++i]!)
    } else if (/\s/.test(ch) && ch !== '\n') {
      push()
    } else if (ch === '>' || ch === '<') {
      if (word !== null && /^\d+$/.test(word.text)) word = null
      else push()
      while (command[i + 1] === '>' || command[i + 1] === '<') i += 1
      if (command[i + 1] === '&') {
        i += 1
        while (/[\d-]/.test(command[i + 1] ?? '')) i += 1
      } else redirect = true
    } else if (ch === '\n' || ch === ';' || ch === '|' || ch === '&') {
      push()
      if (commands[commands.length - 1]!.length > 0) commands.push([])
    } else {
      add(ch, ch === '$' || ch === '`')
    }
  }
  push()

  return commands.filter(words => words.length > 0)
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

// Skips `VAR=x`, `rtk`, `env`, … in front of a simple command.
function skipPrefixes(words: Token[]): number {
  let i = 0
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]!.text) || PREFIXES.has(baseName(words[i]!.text)))) i += 1

  return i
}

// Push options that take a separate value.
const PUSH_VALUED = new Set(['--repo', '--receive-pack', '--exec', '-o', '--push-option'])

// Reads a command line that runs `git push` (behind rtk, env assignments, `cd x &&`, `git -C x`).
// Null when no push runs, or when it is a dry run or a delete, or a folder comes from a shell expansion.
export function parsePush(command: string): Push | null {
  const dirs: string[] = []
  for (const words of simpleCommands(command)) {
    let i = skipPrefixes(words)
    const head = words[i]
    if (head === undefined) continue
    if (head.text === 'cd' || head.text === 'pushd') {
      const target = words[i + 1]
      if (target === undefined || target.expands || target.text.startsWith('~') || target.text === '-') dirs.push('\0')
      else dirs.push(target.text)
      continue
    }
    if (baseName(head.text) !== 'git') continue
    i += 1
    const local: string[] = []
    let unresolvable = false
    while (i < words.length && words[i]!.text.startsWith('-')) {
      const flag = words[i]!.text
      if (flag === '-C') {
        const target = words[i + 1]
        if (target === undefined || target.expands || target.text.startsWith('~')) unresolvable = true
        else local.push(target.text)
        i += 2
      } else if (flag === '-c') i += 2
      else i += 1
    }
    if (words[i]?.text !== 'push') continue
    if (unresolvable || dirs.includes('\0')) return null
    let remote: string | null = null
    const args = words.slice(i + 1)
    if (args.some(arg => ['--dry-run', '-n', '--delete', '-d', '--help', '-h'].includes(arg.text) || arg.text.startsWith(':'))) return null
    for (let j = 0; j < args.length; j += 1) {
      const text = args[j]!.text
      if (PUSH_VALUED.has(text)) j += 1
      else if (!text.startsWith('-')) {
        remote = args[j]!.expands ? null : text
        break
      }
    }

    return { dirs: [...dirs, ...local], remote }
  }

  return null
}

// Applies `cd` targets to the session folder, as plain path arithmetic.
export function resolveDir(cwd: string, dirs: string[]): string {
  let parts = cwd.split('/').filter(Boolean)
  for (const dir of dirs) {
    if (dir.startsWith('/')) parts = []
    for (const part of dir.split('/')) {
      if (part === '' || part === '.') continue
      if (part === '..') parts.pop()
      else parts.push(part)
    }
  }

  return `/${parts.join('/')}`
}

// `owner/repo` of a github.com remote URL (https, ssh or scp-like), else null.
export function githubRepo(url: string): string | null {
  const match = /^(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/|[^@\s]+@github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.trim())

  return match === null ? null : `${match[1]}/${match[2]}`
}

// A remote given on the command line may be a URL instead of a name.
export const isUrl = (remote: string): boolean => /^[a-z]+:\/\//.test(remote) || /^[^/\s]+@[^:\s]+:/.test(remote)

// Parses `gh run list --json …` output; null when it is not an array of runs.
export function parseRuns(stdout: string): Run[] | null {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(raw)) return null
  const str = (x: unknown) => (typeof x === 'string' ? x : '')

  return raw
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>).databaseId === 'number')
    .map(v => ({
      databaseId: v.databaseId as number,
      name: str(v.name),
      workflowName: str(v.workflowName),
      status: str(v.status),
      conclusion: str(v.conclusion),
      url: str(v.url),
    }))
}

const PASSED = ['success', 'neutral', 'skipped']

export type Verdict = 'running' | 'passed' | 'failed'

export function verdict(run: Run): Verdict {
  if (run.status !== 'completed') return 'running'

  return PASSED.includes(run.conclusion) ? 'passed' : 'failed'
}

export const allDone = (runs: Run[]): boolean => runs.length > 0 && runs.every(run => verdict(run) !== 'running')

export const label = (run: Run): string => run.workflowName || run.name || `run ${run.databaseId}`

// "CI ⏳ 2 running", "CI ✓ 3 passed", "CI ✗ 1 failed"; undefined with no run.
export function statusLine(runs: Run[]): string | undefined {
  if (runs.length === 0) return undefined
  const count = (v: Verdict) => runs.filter(run => verdict(run) === v).length
  const running = count('running')
  const failed = count('failed')
  if (running > 0) return failed > 0 ? `CI ⏳ ${running} running · ✗ ${failed} failed` : `CI ⏳ ${running} running`
  if (failed > 0) return `CI ✗ ${failed} failed`

  return `CI ✓ ${count('passed')} passed`
}

// The toast once every run is completed.
export function finalToast(runs: Run[], branch: string): string {
  const failed = runs.filter(run => verdict(run) === 'failed')
  if (failed.length === 0) return `CI ✓ all ${runs.length} passed on ${branch}`
  const names = [...new Set(failed.map(label))].join(', ')
  const url = failed[0]!.url

  return url === '' ? `CI ✗ failed on ${branch}: ${names}` : `CI ✗ failed on ${branch}: ${names} — ${url}`
}

const MARK: Record<Verdict, string> = { running: '⏳', passed: '✓', failed: '✗' }

export function runLine(run: Run): string {
  const state = run.status === 'completed' ? run.conclusion : run.status
  const name = run.name !== '' && run.name !== run.workflowName ? `${label(run)} · ${run.name}` : label(run)

  return `${MARK[verdict(run)]} ${name} (${state})${run.url === '' ? '' : ` ${run.url}`}`
}

export const shortSha = (sha: string) => sha.slice(0, 7)
