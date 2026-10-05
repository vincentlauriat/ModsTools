// Pure logic: classify Bash commands, accumulate the session log, render the recap.
import type { CheckTally, Commit, PullRequest, RecapLog } from '../types'

export const EMPTY: RecapLog = { files: [], commits: [], prs: [], checks: [] }

// Splits a shell command on && || ; | and newlines, outside quotes.
export function segments(command: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < command.length; i++) {
    const c = command[i] ?? ''
    if (quote !== null) {
      if (c === quote) quote = null
      current += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      current += c
      continue
    }
    if (c === ';' || c === '\n' || c === '|' || (c === '&' && command[i + 1] === '&')) {
      if (c === '&' || (c === '|' && command[i + 1] === '|')) i++
      out.push(current)
      current = ''
      continue
    }
    current += c
  }
  out.push(current)

  return out.map(s => s.trim()).filter(Boolean)
}

const WRAPPERS = /^(?:rtk(?:\s+(?:proxy|test|err|summary)(?=\s))?|sudo|bunx|time|env|nohup)\s+/
const NPX = /^npx(?:\s+(?:-y|--yes|-p\s+\S+|--package(?:=|\s+)\S+))*\s+/
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/

// Strips `rtk` (and its proxy/test/err/summary forms), npx and its flags, env assignments and common wrappers.
export function strip(segment: string): string {
  let rest = segment.trim()
  for (;;) {
    const next = rest.replace(WRAPPERS, '').replace(NPX, '').replace(ENV_ASSIGN, '')
    if (next === rest) return rest
    rest = next
  }
}

const unquote = (s: string) => s.replace(/^(['"])([\s\S]*)\1$/, '$2')

const CHECKS: [string, RegExp][] = [
  ['npm test', /^npm\s+(?:run\s+)?test\b/],
  ['pnpm test', /^pnpm\s+(?:run\s+)?test\b/],
  ['yarn test', /^yarn\s+(?:run\s+)?test\b/],
  ['vitest', /^vitest\b/],
  ['jest', /^jest\b/],
  ['pytest', /^(?:pytest|python3?\s+-m\s+pytest)\b/],
  ['cargo test', /^cargo\s+test\b/],
  ['go test', /^go\s+test\b/],
  ['swift test', /^swift\s+test\b/],
  ['xcodebuild', /^xcodebuild\b/],
  ['tsc', /^tsc\b/],
  ['claude plugin test', /^claude\s+plugin\s+test\b/],
]

// The distinct test/build kinds a command runs, in order of appearance.
export function checkKinds(command: string): string[] {
  const kinds: string[] = []
  for (const seg of segments(command)) {
    const rest = strip(seg)
    const found = CHECKS.find(([, re]) => re.test(rest))
    if (found !== undefined && !kinds.includes(found[0])) kinds.push(found[0])
  }

  return kinds
}

export type CommitCall = { dir?: string; message?: string }

const GIT_COMMIT = /^git\s+((?:(?:-C|-c)\s+(?:"[^"]*"|'[^']*'|\S+)\s+)*)commit\b(.*)$/s

// A `git commit` in the command: the folder it runs in (`-C dir`, or a preceding `cd dir`) and its `-m` subject.
export function parseCommit(command: string): CommitCall | null {
  let cdDir: string | undefined
  for (const seg of segments(command)) {
    const rest = strip(seg)
    const cd = /^cd\s+("[^"]*"|'[^']*'|\S+)\s*$/.exec(rest)
    if (cd !== null) {
      cdDir = unquote(cd[1] ?? '')
      continue
    }
    const m = GIT_COMMIT.exec(rest)
    if (m === null) continue
    const opts = m[1] ?? ''
    const c = /-C\s+("[^"]*"|'[^']*'|\S+)/.exec(opts)
    const dir = c !== null ? unquote(c[1] ?? '') : cdDir
    const msg = /(?:^|\s)(?:-[a-zA-Z]*m|--message)(?:\s+|=)("(?:[^"\\]|\\.)*"|'[^']*'|\S+)/.exec(m[2] ?? '')
    const message = msg === null ? undefined : unquote(msg[1] ?? '').split('\n')[0]?.trim()
    const call: CommitCall = {}
    if (dir !== undefined) call.dir = dir
    if (message !== undefined && message !== '') call.message = message

    return call
  }

  return null
}

// Resolves a commit folder against the session folder.
export function resolveDir(dir: string | undefined, cwd: string): string {
  if (dir === undefined || dir === '' || dir === '.') return cwd
  if (dir.startsWith('/')) return dir

  return `${cwd.replace(/\/$/, '')}/${dir}`
}

// "<sha> <subject>" as `git log -1 --format=%h %s` prints it.
export function parseLogLine(stdout: string): Commit | null {
  const line = stdout.trim().split('\n')[0] ?? ''
  const m = /^([0-9a-f]{4,40})\s+(.*)$/.exec(line)

  return m === null ? null : { sha: m[1] ?? '', subject: m[2] ?? '' }
}

export type PrCall = { action: 'created' | 'merged'; number?: number; url?: string }

const PR_URL = /https?:\/\/\S+?\/pull\/(\d+)/

// A `gh pr create|merge` in the command, with any number or URL given as an argument.
export function parsePr(command: string): PrCall | null {
  for (const seg of segments(command)) {
    const m = /^gh\s+pr\s+(create|merge)\b(.*)$/s.exec(strip(seg))
    if (m === null) continue
    const call: PrCall = { action: m[1] === 'create' ? 'created' : 'merged' }
    const args = m[2] ?? ''
    const url = PR_URL.exec(args)
    if (url !== null) {
      call.url = url[0]
      call.number = Number(url[1])
    } else if (call.action === 'merged') {
      const num = /(?:^|\s)#?(\d+)(?=\s|$)/.exec(args)
      if (num !== null) call.number = Number(num[1])
    }

    return call
  }

  return null
}

// Completes a PR call with the URL found in the command's output, when there is one.
export function withOutput(call: PrCall, output: string): PullRequest {
  const url = PR_URL.exec(output)
  if (url === null || call.url !== undefined) return { ...call }

  return { ...call, url: url[0], number: Number(url[1]) }
}

export const relative = (path: string, cwd: string): string => {
  const root = cwd.replace(/\/$/, '')
  return path.startsWith(root + '/') ? path.slice(root.length + 1) : path
}

export const addFile = (log: RecapLog, path: string): RecapLog =>
  log.files.includes(path) ? log : { ...log, files: [...log.files, path] }

export const addCommit = (log: RecapLog, commit: Commit): RecapLog => ({ ...log, commits: [...log.commits, commit] })

export function addPr(log: RecapLog, pr: PullRequest): RecapLog {
  const same = (p: PullRequest) => p.action === pr.action && p.number !== undefined && p.number === pr.number
  return log.prs.some(same) ? log : { ...log, prs: [...log.prs, pr] }
}

export function addChecks(log: RecapLog, kinds: string[], ok: boolean): RecapLog {
  let checks: CheckTally[] = log.checks
  for (const kind of kinds) {
    const found = checks.find(c => c.kind === kind)
    const next: CheckTally = {
      kind,
      pass: (found?.pass ?? 0) + (ok ? 1 : 0),
      fail: (found?.fail ?? 0) + (ok ? 0 : 1),
    }
    checks = found === undefined ? [...checks, next] : checks.map(c => (c.kind === kind ? next : c))
  }

  return { ...log, checks }
}

export function duration(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))

  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}m`
}

const prLine = (pr: PullRequest) => {
  const id = pr.number === undefined ? '' : ` #${pr.number}`
  const url = pr.url === undefined ? '' : ` ${pr.url}`
  return `- ${pr.action}${id}${url}`
}

const runs = (n: number) => `${n} run${n === 1 ? '' : 's'}`

// The recap as Markdown lines.
export function recap(log: RecapLog, usage: { startedAt: number; usd?: number }, now: number): string[] {
  const section = (title: string, items: string[]) => [
    '',
    `### ${title} (${items.length})`,
    ...(items.length === 0 ? ['- none'] : items),
  ]

  return [
    '## Session recap',
    '',
    `- Duration: ${duration(now - usage.startedAt)}`,
    `- Cost: ${usage.usd === undefined ? 'not available' : `$${usage.usd.toFixed(2)}`}`,
    ...section('Files changed', log.files.map(f => `- \`${f}\``)),
    ...section('Commits', log.commits.map(c => (c.sha === '' ? `- ${c.subject}` : `- \`${c.sha}\` ${c.subject}`))),
    ...section('Pull requests', log.prs.map(prLine)),
    ...section(
      'Tests & builds',
      log.checks.map(c => `- ${c.kind}: ${runs(c.pass + c.fail)} · ${c.pass} passed · ${c.fail} failed`),
    ),
  ]
}
