// Word-level parsing, like rm-guard. Bash coverage is limited to `>`/`>>`/`&>` redirections, `tee`,
// `mv`, `cp`, `rm`, `touch`, `mkdir`, `install`, `ln`. Not covered: `sed -i`, `dd of=`, `curl -o`, `tar -C`,
// `git` writes, scripts or editors that write by themselves, variables other than $HOME, command
// substitutions, and symlinks (paths are compared as written, `..` and `~` resolved).

export type Fence = { cwd: string; home: string | undefined; extraRoots: readonly string[] }

const FIXED_ROOTS = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders']

/** Absolute, `~` expanded, `.`/`..`/`//` resolved. Null when a relative path cannot be anchored. */
export function normalize(path: string, cwd: string, home: string | undefined): string | null {
  let p = path
  if (p === '~' || p.startsWith('~/')) {
    if (home === undefined) return null
    p = home + p.slice(1)
  }
  if (!p.startsWith('/')) p = `${cwd}/${p}`
  const out: string[] = []
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }

  return `/${out.join('/')}`
}

const isUnder = (path: string, root: string) => root === '/' || path === root || path.startsWith(`${root}/`)

/** The extra roots option: a comma-separated string or a list. */
export function parseRoots(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []

  return items.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean)
}

/** True when the path is inside the session folder or an allowed root. An unresolvable path is outside. */
export function isAllowed(path: string, fence: Fence): boolean {
  const target = normalize(path, fence.cwd, fence.home)
  if (target === null) return false
  const roots = [fence.cwd, ...FIXED_ROOTS, ...parseRoots(fence.extraRoots)]
  if (fence.home !== undefined) roots.push(`${fence.home}/.claude`)

  return roots.some(root => {
    const r = normalize(root, fence.cwd, fence.home)

    return r !== null && isUnder(target, r)
  })
}

const WRAPPERS: Record<string, Set<string>> = {
  sudo: new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-U']),
  env: new Set(['-u', '-C', '-S']),
  command: new Set(),
  nohup: new Set(),
  time: new Set(),
  nice: new Set(['-n']),
  rtk: new Set(),
}

const unquote = (word: string) => word.replace(/^['"]+|['"]+$/g, '')

const isAssignment = (word: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)

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

const baseName = (word: string) => word.slice(word.lastIndexOf('/') + 1)

// File-descriptor duplications (`2>&1`) are not files; `&>` is a redirection to a file.
const prepare = (command: string) => command.replace(/\d*>&(\d+|-)/g, '').replace(/&>>?/g, '>')

const operands = (args: string[]) => {
  const plain: string[] = []
  let isOptions = true
  for (const arg of args) {
    if (isOptions && arg === '--') isOptions = false
    else if (!isOptions || !arg.startsWith('-')) plain.push(arg)
  }

  return plain
}

/** Paths a simple Bash command writes to, as written (see the header for what is not covered). */
export function bashTargets(command: string): string[] {
  const targets: string[] = []
  for (const part of prepare(command).split(/&&|\|\||[;|&\n]/)) {
    const raw = part.trim().split(/\s+/).filter(Boolean).map(unquote)
    const words: string[] = []
    for (let i = 0; i < raw.length; i++) {
      const m = /^\d*>>?(.*)$/.exec(raw[i]!)
      if (m === null) words.push(raw[i]!)
      else if (m[1] !== '') targets.push(m[1]!)
      else if (raw[i + 1] !== undefined) targets.push(raw[++i]!)
    }
    const [name, ...args] = strip(words)
    const files = operands(args)
    const base = baseName(name ?? '')
    if (['rm', 'rmdir', 'touch', 'mkdir', 'tee', 'mv'].includes(base)) targets.push(...files)
    else if (['cp', 'install', 'ln'].includes(base) && files.length > 0) targets.push(files.at(-1)!)
  }

  return targets.filter(t => t !== '' && !t.startsWith('/dev/') && !/[`$]/.test(t.replace(/^\$\{?HOME\}?/, '')))
}

const expandHome = (t: string) => t.replace(/^\$\{?HOME\}?(?=\/|$)/, '~')

/** The first path outside the fence a Bash command writes to, or null. */
export function bashOutside(command: string, fence: Fence): string | null {
  return bashTargets(command).map(expandHome).find(t => !isAllowed(t, fence)) ?? null
}

/** The path an Edit/Write/NotebookEdit call touches, when it is outside the fence. */
export function fileOutside(input: Record<string, unknown>, fence: Fence): string | null {
  const path = input.file_path ?? input.notebook_path

  return typeof path === 'string' && path !== '' && !isAllowed(path, fence) ? path : null
}
