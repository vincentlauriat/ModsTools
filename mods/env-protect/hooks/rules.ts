// Word-level parsing, like rm-guard: no shell grammar. Not covered: `grep -r KEY .` (no file named),
// variables or command substitutions that build a path, scripts that read the file themselves,
// `dotenv`-style loaders, and a file reached through a symlink or a renamed copy.

const SAFE_ENV_SUFFIXES = new Set(['example', 'sample', 'template'])

const baseName = (word: string) => word.slice(word.lastIndexOf('/') + 1)

/** True when the path names a secret file (private key, credentials, .env…), judged by its name alone. */
export function isSecretPath(path: string): boolean {
  const name = baseName(path.replace(/\/+$/, '')).toLowerCase()
  if (name === '') return false
  if (name === '.env' || name.startsWith('.env.')) {
    return !SAFE_ENV_SUFFIXES.has(name.slice(name.lastIndexOf('.') + 1))
  }
  if (name.startsWith('.env') && /[*?[]/.test(name)) return true
  if (/\.(pem|key|p12)$/.test(name) || name.includes('.keychain')) return true
  if (/^id_(rsa|ed25519|ecdsa|dsa)(_.*)?$/.test(name) && !name.endsWith('.pub')) return true
  if (name === '.netrc' || name === '.npmrc' || name === '.pypirc') return true

  return name === 'credentials' && path.split('/').includes('.aws')
}

// Commands that read or copy the files named in their arguments.
const READERS = new Set([
  'cat', 'less', 'more', 'head', 'tail', 'bat', 'nl', 'tac', 'xxd', 'hexdump', 'od', 'strings', 'base64',
  'source', '.', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'awk', 'sed', 'cut', 'sort', 'uniq', 'diff',
  'cp', 'scp', 'rsync', 'openssl', 'ssh-keygen', 'gpg', 'xargs', 'open',
])

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

/** Each simple command of a shell line as unquoted words, wrappers dropped; `$(…)`, backticks and parentheses split too. */
export function segments(command: string): string[][] {
  return command
    .split(/&&|\|\||\$\(|[;|&\n`()]/)
    .map(part => strip(part.trim().split(/\s+/).filter(Boolean).map(unquote)))
    .filter(words => words.length > 0)
}

// `--flag=path` and `<path` count as the path.
const operand = (word: string) => word.replace(/^<+/, '').replace(/^--[A-Za-z-]+=/, '')

function checkWords(words: string[]): string | null {
  const name = baseName(words[0] ?? '')
  const args = words.slice(1)
  if (name === 'security' && /^find-(generic|internet)-password$/.test(args[0] ?? '')) {
    if (args.some(a => /^-[A-Za-z]*[wg][A-Za-z]*$/.test(a))) return 'keychain password'
  }
  if (!READERS.has(name)) return null
  const secret = args.map(unquote).map(operand).find(isSecretPath)

  return secret === undefined ? null : `${name} ${secret}`
}

/** Why the Bash command reads a secret file, or null when it does not. */
export function checkBash(command: string): string | null {
  for (const words of segments(command)) {
    const reason = checkWords(words)
    if (reason !== null) return reason
  }

  return null
}

// A glob that names a secret file directly (`**/.env`, `*.pem`), not a broad one (`**/*`).
const isSecretGlob = (glob: string) => isSecretPath(glob) || /(^|\/)\.env\*?$|\*\.(pem|key|p12)$/.test(glob)

/** Why a Read/Grep/Glob call targets a secret file, or null. */
export function checkFileTool(tool: string, input: Record<string, unknown>): string | null {
  const str = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '')
  if (tool === 'Read') return isSecretPath(str('file_path')) ? str('file_path') : null
  const path = str('path')
  if (path !== '' && isSecretPath(path)) return path
  const glob = tool === 'Glob' ? str('pattern') : str('glob')

  return glob !== '' && isSecretGlob(glob) ? glob : null
}
