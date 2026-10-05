// Pure logic of notary-watch: reading `notarytool submit` command lines and notarytool's output.

export const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
export const FINAL = ['Accepted', 'Invalid', 'Rejected'] as const
export type Final = (typeof FINAL)[number]
export const IN_PROGRESS = 'In Progress'
const STATUSES = [...FINAL, IN_PROGRESS]

export type Submit = {
  // The auth options to pass again to `notarytool info`, as argv (`--keychain-profile`, `X`, …).
  auth: string[]
  // Whether `auth` can be replayed without a shell or a prompt.
  canPoll: boolean
  wait: boolean
  json: boolean
  file: string | null
}

// Short and long spellings of the options that take a value, by long name.
const VALUE_OPTIONS: Record<string, string> = {
  '-k': '--key',
  '-d': '--key-id',
  '-i': '--issuer',
  '-p': '--keychain-profile',
  '-f': '--output-format',
}
const AUTH = new Set(['--key', '--key-id', '--issuer', '--apple-id', '--password', '--team-id', '--keychain-profile', '--keychain'])
const OTHER_VALUED = new Set(['--output-format', '--webhook', '--timeout'])
const PREFIXES = new Set(['rtk', 'env', 'time', 'command', 'exec', 'nohup', 'caffeinate'])

type Token = { text: string; expands: boolean }

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
      // A redirection is no word of the command: drop its fd, operator and target.
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

// The words after `notarytool submit` when this simple command runs it, else null.
function submitArgs(words: Token[]): Token[] | null {
  let i = 0
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]!.text) || PREFIXES.has(baseName(words[i]!.text)))) i += 1
  if (i < words.length && baseName(words[i]!.text) === 'xcrun') {
    i += 1
    while (i < words.length && words[i]!.text.startsWith('-')) i += words[i]!.text === '--sdk' || words[i]!.text === '--toolchain' ? 2 : 1
  }
  if (baseName(words[i]?.text ?? '') !== 'notarytool' || words[i + 1]?.text !== 'submit') return null

  return words.slice(i + 2)
}

function canReplay(auth: Map<string, Token>): boolean {
  if ([...auth.values()].some(token => token.expands)) return false
  if (auth.has('--keychain-profile')) return true
  if (auth.has('--key') && auth.has('--key-id')) return true

  return auth.has('--apple-id') && auth.has('--team-id') && auth.has('--password')
}

// Reads a command line that runs `xcrun notarytool submit …` (behind rtk, env assignments, `cd x &&`, …).
export function parseSubmit(command: string): Submit | null {
  for (const words of simpleCommands(command)) {
    const args = submitArgs(words)
    if (args === null) continue
    const auth = new Map<string, Token>()
    let wait = false
    let format = 'normal'
    let file: string | null = null
    for (let i = 0; i < args.length; i += 1) {
      const raw = args[i]!.text
      const eq = raw.startsWith('-') ? raw.indexOf('=') : -1
      const flag = eq > 0 ? raw.slice(0, eq) : raw
      const name = VALUE_OPTIONS[flag] ?? flag
      if (AUTH.has(name) || OTHER_VALUED.has(name)) {
        const value = eq > 0 ? { text: raw.slice(eq + 1), expands: args[i]!.expands } : args[++i]
        if (value === undefined) break
        if (AUTH.has(name)) auth.set(name, value)
        else if (name === '--output-format') format = value.text
      } else if (name === '--wait') wait = true
      else if (name === '--no-wait') wait = false
      else if (!raw.startsWith('-')) file = raw
    }
    const authArgv = [...auth].flatMap(([key, token]) => [key, token.text])

    return { auth: authArgv, canPoll: canReplay(auth), wait, json: format === 'json', file }
  }

  return null
}

// Every JSON object notarytool may have printed: the whole text, each line, then the outermost braces.
function jsonObjects(text: string): Record<string, unknown>[] {
  const candidates = [text.trim(), ...text.split('\n').map(line => line.trim()).filter(line => line.startsWith('{'))]
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1))
  const found: Record<string, unknown>[] = []
  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate)
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) found.push(value as Record<string, unknown>)
    } catch {
      // not JSON
    }
  }

  return found
}

const isStatus = (value: unknown): value is string => typeof value === 'string' && STATUSES.includes(value)

// The submission id and last status in notarytool's output: its JSON `id`/`status` keys, else the
// UUID after an `id:` field label and the value after a `status:` label (field names, never sentences).
export function parseOutput(text: string): { id: string | null; status: string | null } {
  for (const object of jsonObjects(text)) {
    if (typeof object.id === 'string' && new RegExp(`^${UUID.source}$`, 'i').test(object.id)) {
      return { id: object.id, status: isStatus(object.status) ? object.status : null }
    }
  }
  const id = new RegExp(`(?:^|\\s)id:\\s*(${UUID.source})`, 'i').exec(text)?.[1] ?? null
  const statuses = [...text.matchAll(/(?:^|\s)status:\s*(Accepted|In Progress|Invalid|Rejected)\b/g)].map(match => match[1]!)

  return { id, status: id === null ? null : (statuses.at(-1) ?? null) }
}

// The status in `notarytool info <id> --output-format json`, or null when it is not that.
export function parseInfo(stdout: string): string | null {
  for (const object of jsonObjects(stdout)) if (isStatus(object.status)) return object.status

  return null
}

export const isFinal = (status: string | null): status is Final => status !== null && (FINAL as readonly string[]).includes(status)

export const shortId = (id: string) => id.slice(0, 8)

export function finalToast(id: string, status: Final): string {
  if (status === 'Accepted') return `notary ✓ accepted — now staple (${shortId(id)})`

  return `notary ✗ ${status.toLowerCase()} (${shortId(id)}) — see why: xcrun notarytool log ${id} <auth>`
}

export const unpolledToast = (id: string) =>
  `notary: ${shortId(id)} submitted — not polled (auth comes from the shell or a prompt); check with xcrun notarytool info ${id} <auth>`

export const timedOutToast = (id: string) => `notary: stopped watching ${shortId(id)} after 2h (still ${IN_PROGRESS})`

// The status line for the submissions still polled (newest last), or undefined to clear it.
export function statusLine(polled: { id: string }[]): string | undefined {
  if (polled.length === 0) return undefined
  if (polled.length === 1) return `notary: ${shortId(polled[0]!.id)} ${IN_PROGRESS}`

  return `notary: ${polled.length} in progress`
}

export function age(ms: number): string {
  const minutes = Math.floor(ms / 60_000)

  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}
