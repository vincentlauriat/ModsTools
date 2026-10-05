export const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']
export const DEFAULT_MAX_HEADER = 100

const HEADER = new RegExp(`^(?:${TYPES.join('|')})(?:\\([^()\\s][^()]*\\))?!?: \\S`)
// Subjects git or its tools write themselves.
const EXEMPT = /^(?:Merge |(?:fixup|squash|amend)! |Revert ")/
// `$(cat <<'EOF' ... EOF)`: the heredoc form of a -m argument.
const HEREDOC = /^\$\(\s*cat\s*<<-?\s*(["']?)(\w+)\1[ \t]*\n([\s\S]*?)\n[ \t]*\2[ \t]*\n?\s*\)$/

export type CommitInfo = {
  subject: string | null // first line of the first -m, or null
  file: string | null // -F / --file argument when there is no -m
  dir: string | undefined // last `cd` or `git -C` folder before the commit
}

// The words of each simple command of a shell line, quotes removed.
// A quoted argument stays one word, newlines and heredocs included.
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
    } else if (c === ';' || c === '&' || c === '|' || c === '\n') endStatement()
    else if (c === ' ' || c === '\t') endWord()
    else {
      word += c
      inWord = true
    }
  }
  endStatement()

  return statements
}

// The words after `git` and its global options (`-C dir` kept apart), or null when not git.
function gitCommand(words: string[]): { args: string[]; dir: string | undefined } | null {
  let i = 0
  while (words[i] !== undefined && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]!)) i++
  if (words[i] === 'rtk') i++
  if (words[i] !== 'git') return null
  i++
  let dir: string | undefined
  while (words[i]?.startsWith('-')) {
    if (words[i] === '-C') dir = words[i + 1]
    i += words[i] === '-C' || words[i] === '-c' ? 2 : 1
  }

  return { args: words.slice(i), dir }
}

// First non-blank line of a message.
export const firstLine = (text: string) => text.split('\n').find(l => l.trim() !== '') ?? ''

function messageText(value: string): string {
  const heredoc = HEREDOC.exec(value)

  return heredoc === null ? value : heredoc[3]!
}

function parseCommit(args: string[]): Pick<CommitInfo, 'subject' | 'file'> {
  let subject: string | null = null
  let file: string | null = null
  for (let i = 1; i < args.length; i++) {
    const a = args[i]!
    if (a === '-C' || a === '-c' || a === '--reuse-message' || a === '--reedit-message' || a.startsWith('--reuse-message=') || a.startsWith('--reedit-message=')) {
      return { subject: null, file: null }
    }
    const message = a === '--message' ? args[++i] : a.startsWith('--message=') ? a.slice(10) : undefined
    const short = /^-[asnveioqpu]*([mF])(.*)$/.exec(a)
    if (a.startsWith('--')) {
      const path = a === '--file' ? args[++i] : a.startsWith('--file=') ? a.slice(7) : undefined
      if (path !== undefined && file === null) file = path
      if (message !== undefined && subject === null) subject = firstLine(messageText(message))
    } else if (short !== null) {
      const value = short[2] !== '' ? short[2]! : args[++i]
      if (value === undefined) continue
      if (short[1] === 'm' && subject === null) subject = firstLine(messageText(value))
      if (short[1] === 'F' && file === null) file = value
    }
  }

  return { subject, file: subject === null ? file : null }
}

/** One entry per `git commit` of the line. */
export function commitMessages(command: string): CommitInfo[] {
  const found: CommitInfo[] = []
  let cd: string | undefined
  for (const words of shellWords(command)) {
    if (words[0] === 'cd' && words[1] !== undefined) cd = words[1]
    const git = gitCommand(words)
    if (git === null || git.args[0] !== 'commit') continue
    found.push({ ...parseCommit(git.args), dir: git.dir ?? cd })
  }

  return found
}

export function resolveFile(file: string, dir: string | undefined, cwd: string): string {
  if (file.startsWith('/')) return file
  const base = dir === undefined ? cwd : dir.startsWith('/') ? dir : `${cwd}/${dir}`

  return `${base}/${file}`
}

/** Why the subject is not acceptable, or null when it is (or cannot be judged). */
export function lint(subject: string, maxHeader: number): string | null {
  const header = subject.trimEnd()
  if (header === '') return 'the commit subject is empty'
  if (header.startsWith('$') || EXEMPT.test(header)) return null
  if (!HEADER.test(header)) return `"${header.length > 60 ? `${header.slice(0, 57)}...` : header}" is not a Conventional Commit header`
  if (header.length > maxHeader) return `the header is ${header.length} characters (max ${maxHeader})`

  return null
}
