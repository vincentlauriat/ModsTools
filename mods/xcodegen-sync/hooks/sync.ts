// Pure logic of xcodegen-sync: which paths a tool call touched, and which folders a
// command regenerated. No `$` here: the hooks resolve folders on disk.

export const SPEC = 'project.yml'

// Wrappers that run the command after them; the value is their options that take an argument.
const WRAPPERS: Record<string, Set<string>> = {
  rtk: new Set(),
  sudo: new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-U']),
  env: new Set(['-u', '-C', '-S']),
  command: new Set(),
  nohup: new Set(),
  time: new Set(),
  nice: new Set(['-n']),
}

const unquote = (word: string) => word.replace(/^['"]+|['"]+$/g, '')

const isAssignment = (word: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)

// The command a segment runs, wrappers, their options and env assignments dropped.
function strip(words: string[]): string[] {
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

// Each simple command of a shell line as unquoted words, wrappers dropped, in order.
export function segments(command: string): string[][] {
  return command
    .split(/&&|\|\||[;|&\n]/)
    .map(part => strip(part.trim().split(/\s+/).filter(Boolean).map(unquote)))
    .filter(words => words.length > 0)
}

export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export function dirName(path: string): string {
  const cut = path.lastIndexOf('/')

  return cut <= 0 ? '/' : path.slice(0, cut)
}

/** `path` made absolute against `cwd`, `.` and `..` folded; `~` paths against `home` when known. */
export function resolve(cwd: string, path: string, home: string | null = null): string | null {
  let full = path
  if (path === '~' || path.startsWith('~/')) {
    if (home === null) return null
    full = home + path.slice(1)
  } else if (!path.startsWith('/')) full = `${cwd}/${path}`
  const parts: string[] = []
  for (const part of full.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }

  return `/${parts.join('/')}`
}

/** The folder and every folder above it, closest first, ending at `/`. */
export function ancestors(dir: string): string[] {
  const list = [dir]
  let current = dir
  while (current !== '/') {
    current = dirName(current)
    list.push(current)
  }

  return list
}

export const isSwift = (path: string) => path.endsWith('.swift')

export const isSpec = (path: string) => baseName(path) === SPEC

// The words after `git` and its global options, with the folder `-C` points at.
function gitArgs(words: string[], cwd: string, home: string | null): { args: string[]; cwd: string } | null {
  if (baseName(words[0] ?? '') !== 'git') return null
  let i = 1
  let dir = cwd
  while (words[i]?.startsWith('-')) {
    if (words[i] === '-C' && words[i + 1] !== undefined) dir = resolve(dir, words[i + 1]!, home) ?? dir
    i += words[i] === '-C' || words[i] === '-c' ? 2 : 1
  }

  return { args: words.slice(i), cwd: dir }
}

// Walks a shell line, following `cd`, and hands each segment its working folder.
function walk(command: string, cwd: string, home: string | null, visit: (words: string[], cwd: string) => void) {
  let dir = cwd
  for (const words of segments(command)) {
    if (words[0] === 'cd') {
      const target = words[1] === undefined ? home : resolve(dir, words[1], home)
      if (target !== null) dir = target
      continue
    }
    visit(words, dir)
  }
}

/**
 * The `.swift` paths (absolute, globs kept as written) that `rm`, `git rm`, `mv` or
 * `git mv` in the line delete or move; empty when the line touches no Swift file.
 */
export function swiftTargets(command: string, cwd: string, home: string | null = null): string[] {
  const found: string[] = []
  walk(command, cwd, home, (words, dir) => {
    let args: string[] | null = null
    let base = dir
    const name = baseName(words[0] ?? '')
    if (name === 'rm' || name === 'mv') args = words.slice(1)
    const git = gitArgs(words, dir, home)
    if (git !== null && (git.args[0] === 'rm' || git.args[0] === 'mv')) {
      args = git.args.slice(1)
      base = git.cwd
    }
    if (args === null) return
    for (const arg of args) {
      if (arg.startsWith('-') || !isSwift(arg)) continue
      const path = resolve(base, arg, home)
      if (path !== null) found.push(path)
    }
  })

  return found
}

/**
 * The folders whose `xcodegen generate` (or bare `xcodegen`) the line runs: the folder
 * of `--spec`/`-s` when given, else the segment's working folder.
 */
export function generatedFolders(command: string, cwd: string, home: string | null = null): string[] {
  const found: string[] = []
  walk(command, cwd, home, (words, dir) => {
    if (baseName(words[0] ?? '') !== 'xcodegen') return
    const sub = words[1]
    if (sub !== undefined && sub !== 'generate' && !sub.startsWith('-')) return
    const at = words.findIndex(word => word === '--spec' || word === '-s')
    const inline = words.find(word => word.startsWith('--spec='))
    const spec = at >= 0 ? words[at + 1] : inline?.slice('--spec='.length)
    const path = spec === undefined ? dir : resolve(dir, spec, home)
    if (path !== null) found.push(spec === undefined ? path : dirName(path))
  })

  return found
}

/** `path` with the home folder shown as `~`. */
export function display(path: string, home: string | null): string {
  if (home === null || home === '/' || home === '') return path
  if (path === home) return '~'

  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

export const bandText = (folder: string, home: string | null) =>
  `XcodeGen: project.yml or Swift files changed in ${display(folder, home)} — run xcodegen generate`

/** The first non-empty line of a program's output, trimmed. */
export function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .map(line => line.trim())
      .find(line => line !== '') ?? ''
  )
}

/** The toast after the Run button: ok, or the first line the program wrote. */
export function runToast(folder: string, home: string | null, exitCode: number, stderr: string, stdout: string): string {
  if (exitCode === 0) return `xcodegen: generated ${display(folder, home)}`
  const line = firstLine(stderr) || firstLine(stdout) || `exit code ${exitCode}`

  return `xcodegen failed in ${display(folder, home)}: ${line}`
}

export const addFolder = (list: string[], folder: string) => (list.includes(folder) ? list : [...list, folder])

export const removeFolders = (list: string[], folders: string[]) => list.filter(one => !folders.includes(one))
