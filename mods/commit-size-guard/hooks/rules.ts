export const DEFAULT_MAX_MB = 5
export const MB = 1024 * 1024
export const BINARY_MAX_BYTES = MB
export const MAX_LISTED = 5

// ---------------------------------------------------------------- shell

// The words of each simple command of a shell line, quotes removed (a quoted argument stays one word).
export function shellWords(command: string): string[][] {
  const statements: string[][] = []
  let words: string[] = []
  let word = ''
  let inWord = false
  const endWord = () => {
    if (inWord) words.push(word)
    word = ''
    inWord = false
  }
  const endStatement = () => {
    endWord()
    if (words.length > 0) statements.push(words)
    words = []
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (c === "'") {
      const end = command.indexOf("'", i + 1)
      word += command.slice(i + 1, end === -1 ? undefined : end)
      inWord = true
      i = end === -1 ? command.length : end
    } else if (c === '"') {
      inWord = true
      for (i++; i < command.length && command[i] !== '"'; i++) {
        if (command[i] === '\\' && '"\\$`\n'.includes(command[i + 1] ?? 'x')) i++
        word += command[i] ?? ''
      }
    } else if (c === '\\') {
      if (command[i + 1] !== '\n') {
        word += command[i + 1] ?? ''
        inWord = true
      }
      i++
    } else if (c === ';' || c === '&' || c === '|' || c === '\n' || c === '(' || c === ')') endStatement()
    else if (c === ' ' || c === '\t') endWord()
    else {
      word += c
      inWord = true
    }
  }
  endStatement()

  return statements
}

const isAssignment = (word: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)

// Prefixes that run the command after them, with their options that take an argument.
const WRAPPERS: Record<string, Set<string>> = {
  rtk: new Set(),
  env: new Set(['-u', '-C', '-S']),
  command: new Set(),
  nohup: new Set(),
  time: new Set(),
  sudo: new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-U']),
}

function unwrap(words: string[]): string[] {
  let i = 0
  for (;;) {
    while (words[i] !== undefined && isAssignment(words[i]!)) i++
    const takesArg = WRAPPERS[words[i] ?? '']
    if (takesArg === undefined) break
    i++
    while (words[i]?.startsWith('-')) i += takesArg.has(words[i]!) ? 2 : 1
  }

  return words.slice(i)
}

// `a` then `b`, `b` absolute replacing `a`; undefined stands for the session folder.
export function joinDir(a: string | undefined, b: string): string {
  if (b.startsWith('/') || a === undefined) return b

  return `${a.replace(/\/+$/, '')}/${b}`
}

// An absolute path with `.`, `..` and repeated slashes resolved; relative paths are taken under `cwd`.
export function resolvePath(path: string, cwd: string): string {
  const joined = path.startsWith('/') ? path : `${cwd.replace(/\/+$/, '')}/${path}`
  const parts: string[] = []
  for (const part of joined.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }

  return `/${parts.join('/')}`
}

const GIT_OPTS_WITH_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--exec-path'])

export type GitRun = { sub: string; args: string[]; dir: string | undefined }

// Each `git <sub>` of the line with the folder it runs in (`cd` before it, `git -C`), relative to the session folder.
export function gitRuns(command: string): GitRun[] {
  const runs: GitRun[] = []
  let dir: string | undefined
  for (const statement of shellWords(command)) {
    const words = unwrap(statement)
    if (words[0] === 'cd') {
      const target = words[1]
      if (target !== undefined && target !== '-' && !target.startsWith('~') && !target.includes('$')) dir = joinDir(dir, target)
      continue
    }
    if (words[0] !== 'git') continue
    let runDir = dir
    let i = 1
    while (words[i]?.startsWith('-')) {
      const opt = words[i]!
      if (opt === '-C' && words[i + 1] !== undefined) runDir = joinDir(runDir, words[i + 1]!)
      i += GIT_OPTS_WITH_ARG.has(opt) ? 2 : 1
    }
    const sub = words[i]
    if (sub !== undefined) runs.push({ sub, args: words.slice(i + 1), dir: runDir })
  }

  return runs
}

// ---------------------------------------------------------------- git commit / add arguments

const COMMIT_SHORT_WITH_ARG = new Set(['m', 'F', 'C', 'c', 't'])
const COMMIT_LONG_WITH_ARG = new Set([
  '--message',
  '--file',
  '--reuse-message',
  '--reedit-message',
  '--template',
  '--author',
  '--date',
  '--cleanup',
  '--fixup',
  '--squash',
  '--trailer',
  '--pathspec-from-file',
])

export type CommitArgs = { all: boolean; dryRun: boolean; paths: string[] }

export function commitArgs(args: string[]): CommitArgs {
  const out: CommitArgs = { all: false, dryRun: false, paths: [] }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--') {
      out.paths.push(...args.slice(i + 1))
      break
    }
    if (arg.startsWith('--')) {
      const name = arg.split('=')[0]!
      if (name === '--all') out.all = true
      else if (name === '--dry-run') out.dryRun = true
      if (COMMIT_LONG_WITH_ARG.has(name) && !arg.includes('=')) i++
    } else if (arg.startsWith('-') && arg.length > 1) {
      for (let j = 1; j < arg.length; j++) {
        const flag = arg[j]!
        if (flag === 'a') out.all = true
        if (COMMIT_SHORT_WITH_ARG.has(flag)) {
          if (j === arg.length - 1) i++
          break
        }
        // -u and -S take their value attached only
        if (flag === 'u' || flag === 'S') break
      }
    } else out.paths.push(arg)
  }

  return out
}

export type AddArgs = { all: boolean; update: boolean; dryRun: boolean; paths: string[] }

export function addArgs(args: string[]): AddArgs {
  const out: AddArgs = { all: false, update: false, dryRun: false, paths: [] }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--') {
      out.paths.push(...args.slice(i + 1))
      break
    }
    if (arg.startsWith('--')) {
      const name = arg.split('=')[0]!
      if (name === '--all' || name === '--no-ignore-removal') out.all = true
      else if (name === '--update') out.update = true
      else if (name === '--dry-run') out.dryRun = true
      else if (name === '--chmod' && !arg.includes('=')) i++
    } else if (arg.startsWith('-') && arg.length > 1) {
      if (arg.includes('A')) out.all = true
      if (arg.includes('u')) out.update = true
      if (arg.includes('n')) out.dryRun = true
    } else out.paths.push(arg)
  }

  return out
}

// ---------------------------------------------------------------- git output

export type Changed = { path: string; binary: boolean }

// `git diff --numstat -z`: `added\tdeleted\tpath\0`, or `added\tdeleted\t\0from\0to\0` for a rename; binary shows `-\t-`.
export function parseNumstat(text: string): Changed[] {
  const fields = text.split('\0')
  const out: Changed[] = []
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!
    const match = /^(-|\d+)\t(-|\d+)\t([\s\S]*)$/.exec(field)
    if (match === null) continue
    const binary = match[1] === '-' && match[2] === '-'
    let path = match[3]!
    if (path === '') {
      path = fields[i + 2] ?? ''
      i += 2
    }
    if (path !== '') out.push({ path, binary })
  }

  return out
}

// A `-z` listing cut off mid-entry, kept up to its last whole entry.
export function wholeEntries(text: string): string {
  return text.slice(0, text.lastIndexOf('\0') + 1)
}

export const parseNulList = (text: string) => text.split('\0').filter(one => one !== '')

export function parseSize(text: string): number | null {
  const n = Number(text.trim())

  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

// The path relative to `root`, or null when it is outside.
export function relativeTo(path: string, root: string): string | null {
  const base = root.replace(/\/+$/, '')
  if (path === base) return ''

  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : null
}

// ---------------------------------------------------------------- what should not be committed

const ARCHIVE = /\.(dmg|zip|ipa)$/i
const BUNDLE = /\.(app|xcarchive)$/i
const CACHE_DIRS = new Set(['DerivedData', 'node_modules', '.build'])

// Why a repo-relative path looks like a build or release artifact, with the folder that holds it; null otherwise.
export function artifactOf(path: string): { reason: string; group: string } | null {
  const parts = path.split('/').filter(Boolean)
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    const isDir = i < parts.length - 1
    if (CACHE_DIRS.has(part)) return { reason: `inside ${part}/`, group: `${parts.slice(0, i + 1).join('/')}/` }
    if (BUNDLE.test(part) && (isDir || /\.xcarchive$/i.test(part))) {
      return { reason: `inside a ${part.slice(part.lastIndexOf('.'))} bundle`, group: `${parts.slice(0, i + 1).join('/')}/` }
    }
  }
  const name = parts[parts.length - 1] ?? ''
  if (ARCHIVE.test(name)) return { reason: `build artifact (*${name.slice(name.lastIndexOf('.')).toLowerCase()})`, group: path }
  if (parts[0] === 'release' && parts.length > 1 && !/\.md$/i.test(name)) return { reason: 'release artifact (release/)', group: path }

  return null
}

export type Candidate = { path: string; size: number | null; binary: boolean }
export type Offender = { path: string; size: number | null; reasons: string[]; files: number }

// The files to ask about, an artifact folder counted once with its files.
export function offenders(files: readonly Candidate[], maxBytes: number): Offender[] {
  const out = new Map<string, Offender>()
  for (const file of files) {
    const artifact = artifactOf(file.path)
    const reasons: string[] = []
    if (artifact !== null) reasons.push(artifact.reason)
    if (file.size !== null && file.size > maxBytes) reasons.push(`over ${formatMb(maxBytes)}`)
    else if (file.binary && file.size !== null && file.size > BINARY_MAX_BYTES) reasons.push(`binary over ${formatMb(BINARY_MAX_BYTES)}`)
    if (reasons.length === 0) continue
    const key = artifact?.group ?? file.path
    const seen = out.get(key)
    if (seen === undefined) out.set(key, { path: key, size: file.size, reasons, files: 1 })
    else {
      seen.files += 1
      seen.size = seen.size === null || file.size === null ? seen.size ?? file.size : seen.size + file.size
      for (const reason of reasons) if (!seen.reasons.includes(reason)) seen.reasons.push(reason)
    }
  }

  return [...out.values()]
}

export const TRUNCATED: Offender = { path: 'file list', size: null, reasons: ['over 4 MiB of paths, only its start was checked'], files: 1 }

// A listing too long to read in full is itself worth asking about (tens of thousands of files).
export function withTruncation(found: readonly Offender[], truncated: boolean): Offender[] {
  return truncated ? [...found, TRUNCATED] : [...found]
}

export function formatMb(bytes: number): string {
  const mb = bytes / MB
  if (mb >= 1) return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`

  return `${(bytes / 1024).toFixed(1)} KB`
}

export function askReason(found: readonly Offender[], verb: 'commit' | 'add'): string {
  const lines = found.slice(0, MAX_LISTED).map(one => {
    const size = one.size === null ? '' : `, ${formatMb(one.size)}`
    const count = one.files > 1 ? ` (${one.files} files)` : ''
    return `- ${one.path}${count}: ${one.reasons.join(', ')}${size}`
  })
  if (found.length > MAX_LISTED) lines.push(`- and ${found.length - MAX_LISTED} more`)
  const what = verb === 'commit' ? 'this commit includes' : 'this git add stages'
  const fix =
    verb === 'commit'
      ? 'add them to .gitignore and unstage them (git restore --staged <path>)'
      : 'add them to .gitignore instead of staging them'

  return `commit-size-guard: ${what} files that usually do not belong in git:\n${lines.join('\n')}\nConfirm only if they are meant to be versioned; otherwise ${fix}. Stop the checks with /commit-size-guard off.`
}

export function parseMaxMb(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_MB
}
