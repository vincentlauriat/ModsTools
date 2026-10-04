// Wrappers that run the command after them; the value is their options that take an argument.
const WRAPPERS: Record<string, Set<string>> = {
  rtk: new Set(),
  sudo: new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-U']),
  env: new Set(['-u', '-C', '-S']),
  command: new Set(),
  nohup: new Set(),
  time: new Set(),
  nice: new Set(['-n']),
  xargs: new Set(['-I', '-n', '-P', '-L', '-d', '-E', '-s', '-a']),
  sh: new Set(),
  bash: new Set(),
  zsh: new Set(),
  eval: new Set(),
}

const SQL_CLIENT = /\b(psql|sqlite3|mysql|mariadb|duckdb|sqlcmd)\b/

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

// Each simple command of a shell line as unquoted words, wrappers dropped.
export function segments(command: string): string[][] {
  return command
    .split(/&&|\|\||[;|&\n]/)
    .map(part => strip(part.trim().split(/\s+/).filter(Boolean).map(unquote)))
    .filter(words => words.length > 0)
}

const baseName = (word: string) => word.slice(word.lastIndexOf('/') + 1)

const isScratch = (target: string) =>
  (target.startsWith('/tmp/') || target.startsWith('/private/tmp/')) && !target.split('/').includes('..')

// `rm` with both recursive and force, unless every target is under /tmp/ or /private/tmp/.
// `rm -r` without force is allowed: it still prompts on write-protected files.
// No target asks too: the targets may come from stdin (`xargs rm -rf`).
function checkRm(args: string[]): string | null {
  let isRecursive = false
  let isForce = false
  const targets: string[] = []
  let isOptions = true
  for (const arg of args) {
    if (isOptions && arg === '--') isOptions = false
    else if (isOptions && arg.startsWith('--')) {
      if (arg === '--recursive') isRecursive = true
      if (arg === '--force') isForce = true
    } else if (isOptions && /^-[A-Za-z]+$/.test(arg)) {
      if (/[rR]/.test(arg)) isRecursive = true
      if (arg.includes('f')) isForce = true
    } else targets.push(arg)
  }
  if (!isRecursive || !isForce) return null

  return targets.length > 0 && targets.every(isScratch) ? null : `rm -rf ${targets.join(' ')}`.trim()
}

// The words after `git` and its global options, or null when it is not git.
function gitArgs(words: string[]): string[] | null {
  if (words[0] !== 'git') return null
  let i = 1
  while (words[i]?.startsWith('-')) i += words[i] === '-C' || words[i] === '-c' ? 2 : 1

  return words.slice(i)
}

const shortHas = (args: string[], letter: string) => args.some(a => /^-[A-Za-z]+$/.test(a) && a.includes(letter))

function checkGit(args: string[]): string | null {
  const [sub, ...rest] = args
  if (sub === 'reset' && rest.includes('--hard')) return 'git reset --hard'
  if (sub === 'clean') {
    const isForce = shortHas(rest, 'f') || rest.includes('--force')
    const isDryRun = shortHas(rest, 'n') || rest.includes('--dry-run')

    return isForce && !isDryRun ? 'git clean -f' : null
  }
  if (sub === 'checkout' && rest.includes('.')) return 'git checkout . (discards every change)'
  if (sub === 'restore' && rest.includes('.')) {
    const isStagedOnly = (rest.includes('--staged') || shortHas(rest, 'S')) && !(rest.includes('--worktree') || shortHas(rest, 'W'))

    return isStagedOnly ? null : 'git restore . (discards every change)'
  }

  return null
}

function checkWords(words: string[]): string | null {
  const name = baseName(words[0] ?? '')
  const args = words.slice(1)
  if (name === 'rm') return checkRm(args)
  if (/^mkfs(\.|$)/.test(name)) return 'mkfs'
  if (name === 'dd' && args.some(a => a.startsWith('of=/dev/'))) return 'dd onto a device'
  if (name === 'find') {
    if (args.includes('-delete')) return 'find -delete'
    const exec = args.findIndex(a => a === '-exec' || a === '-execdir')
    if (exec >= 0) return checkWords(strip(args.slice(exec + 1)))
  }
  const git = gitArgs(words)

  return git === null ? null : checkGit(git)
}

/** Why the command is destructive and needs the user's confirmation, or null when it is not. */
export function check(command: string): string | null {
  if (SQL_CLIENT.test(command)) {
    if (/\bdrop\s+(table|database)\b/i.test(command)) return 'SQL DROP'
    if (/\btruncate\s+(table\s+)?[A-Za-z_"`]/i.test(command)) return 'SQL TRUNCATE'
  }
  for (const words of segments(command)) {
    const reason = checkWords(words)
    if (reason !== null) return reason
  }

  return null
}
