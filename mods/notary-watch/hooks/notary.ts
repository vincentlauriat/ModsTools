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

// ── Release scripts ──────────────────────────────────────────────────────────

export type ScriptCall = {
  // The script's path as the session can read it (a `cd x &&` before it applied), or null when unknown.
  path: string | null
  name: string
  // `VAR=value` assignments written before the script on the command line (literal values only).
  env: Record<string, string>
}

const INTERPRETERS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'source', '.'])
const SCRIPT_EXT = /\.(?:sh|bash|zsh|command)$/i
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/

function joinPath(dir: string | null, path: string): string | null {
  if (path.startsWith('/')) return path
  if (dir === null || path.startsWith('~')) return null

  return dir === '' ? path : `${dir.replace(/\/+$/, '')}/${path}`
}

// The release script a command runs, in command position only: the command itself when it is a path
// (`./Scripts/release.sh`, `Scripts/release.sh`, `release.sh`) or the script given to bash/sh/zsh/source/.
// Its basename must contain `pattern` (case-insensitive); an empty pattern turns this off.
export function scriptCall(command: string, pattern: string): ScriptCall | null {
  const needle = pattern.trim().toLowerCase()
  if (needle === '') return null
  let dir: string | null = ''
  for (const words of simpleCommands(command)) {
    const env: Record<string, string> = {}
    let i = 0
    for (; i < words.length; i += 1) {
      const assignment = ASSIGNMENT.exec(words[i]!.text)
      if (assignment !== null) {
        if (!words[i]!.expands) env[assignment[1]!] = assignment[2]!
      } else if (!PREFIXES.has(baseName(words[i]!.text))) break
    }
    const head = words[i]
    if (head === undefined) continue
    if (head.text === 'cd' || head.text === 'pushd') {
      const target = words[i + 1]
      dir = target === undefined || target.expands || target.text === '-' ? null : joinPath(dir, target.text)
      continue
    }
    let candidate: Token | undefined
    if (INTERPRETERS.has(baseName(head.text))) {
      let j = i + 1
      while (j < words.length && words[j]!.text.startsWith('-')) j += 1
      candidate = words[j]
    } else if (head.text.includes('/') || SCRIPT_EXT.test(head.text)) candidate = head
    if (candidate === undefined || candidate.expands) continue
    const name = baseName(candidate.text)
    if (name.toLowerCase().includes(needle)) return { path: joinPath(dir, candidate.text), name, env }
  }

  return null
}

const VALUE = `("[^"\\n]*"|'[^'\\n]*'|[^\\s;&|)]+)`

// The script without its comments: a header comment may name another profile than the code uses.
function withoutComments(text: string): string {
  return text
    .split('\n')
    .map(line => (line.trimStart().startsWith('#') ? '' : line.replace(/\s#.*$/, '')))
    .join('\n')
}

function unquote(raw: string): { text: string; literal: boolean } {
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) return { text: raw.slice(1, -1), literal: true }
  const text = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw

  return { text, literal: !/[$`]/.test(text) }
}

const validProfile = (value: string) => (value.trim() !== '' && !/[$`\\"'\n]/.test(value) ? value.trim() : null)

// `${VAR:-default}`, `${VAR-default}`, `${VAR}` or `$VAR`: the variable and its literal default.
function reference(text: string): { name: string; fallback: string | null } | null {
  const match = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)(?::?-([^}]*))?\}?$/.exec(text)
  if (match === null) return null

  return { name: match[1]!, fallback: match[2] === undefined ? null : validProfile(match[2]) }
}

// The value a variable takes in the script: the command line's own assignment first, then the
// script's first assignment whose value is a literal or a `${VAR:-literal}` default.
function variable(name: string, text: string, env: Record<string, string>): string | null {
  if (env[name] !== undefined) return validProfile(env[name])
  const assignments = new RegExp(`(?:^|[\\s;&(])(?:(?:export|readonly|local|declare(?:\\s+-[A-Za-z]+)*)\\s+)?${name}=${VALUE}`, 'gm')
  for (const match of text.matchAll(assignments)) {
    const value = unquote(match[1]!)
    if (value.literal) return validProfile(value.text)
    const ref = reference(value.text)
    if (ref === null) continue
    const given = env[ref.name]
    if (given !== undefined) return validProfile(given)
    if (ref.fallback !== null) return ref.fallback
  }

  return null
}

function resolveValue(raw: string, text: string, env: Record<string, string>): string | null {
  const value = unquote(raw)
  if (value.literal) return validProfile(value.text)
  const ref = reference(value.text)
  if (ref === null) return null

  const given = env[ref.name]

  return given !== undefined ? validProfile(given) : (variable(ref.name, text, env) ?? ref.fallback)
}

// The notarytool keychain profile a release script uses, read from its text: the `--keychain-profile`
// values (resolved through `VAR="${VAR:-name}"`-style defaults), else a `*PROFILE*="${…:-name}"` default.
// Null when none is found, when one cannot be resolved, or when the script names several.
export function scriptProfile(script: string, env: Record<string, string> = {}): string | null {
  const text = withoutComments(script)
  const found = new Set<string>()
  let unresolved = false
  for (const match of text.matchAll(new RegExp(`--keychain-profile(?:=|[ \\t]+)${VALUE}`, 'g'))) {
    const value = resolveValue(match[1]!, text, env)
    if (value === null) unresolved = true
    else found.add(value)
  }
  if (unresolved || found.size > 1) return null
  if (found.size === 1) return [...found][0]!
  for (const match of text.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=["']?\$\{([A-Za-z_][A-Za-z0-9_]*):?-([^}"'\s]+)\}/g)) {
    if (match[1] !== match[2] || !/profile/i.test(match[1]!)) continue
    const value = env[match[1]!] !== undefined ? validProfile(env[match[1]!]!) : validProfile(match[3]!)
    if (value !== null) found.add(value)
  }

  return found.size === 1 ? [...found][0]! : null
}

export type HistoryEntry = { id: string; name: string | null; status: string; createdMs: number }

// The submissions in `notarytool history --output-format json` (`{ "history": [ { createdDate, id, name,
// status } ], "message" }`), or null when the output is not that JSON. A missing `history` is no submission.
export function parseHistory(stdout: string): HistoryEntry[] | null {
  const object = jsonObjects(stdout).find(value => Array.isArray(value.history) || typeof value.message === 'string')
  if (object === undefined) return null
  const entries: HistoryEntry[] = []
  for (const item of Array.isArray(object.history) ? (object.history as unknown[]) : []) {
    if (item === null || typeof item !== 'object') continue
    const { id, name, status, createdDate } = item as Record<string, unknown>
    if (typeof id !== 'string' || !new RegExp(`^${UUID.source}$`, 'i').test(id) || !isStatus(status) || typeof createdDate !== 'string') continue
    const createdMs = Date.parse(createdDate)
    if (Number.isNaN(createdMs)) continue
    entries.push({ id, name: typeof name === 'string' ? name : null, status, createdMs })
  }

  return entries
}

export const HISTORY_SLACK_MS = 60_000

// The submissions created since `sinceMs`, less a minute of slack for the clocks' drift, oldest first.
export function newSubmissions(entries: HistoryEntry[], sinceMs: number): HistoryEntry[] {
  return entries.filter(entry => entry.createdMs >= sinceMs - HISTORY_SLACK_MS).sort((a, b) => a.createdMs - b.createdMs)
}
