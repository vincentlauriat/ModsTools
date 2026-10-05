// Pure rules of sparkle-guard: which shell commands and file edits put the Sparkle
// EdDSA signing key at risk. No `$` here.

export type Verdict = { decision: 'deny' | 'ask'; reason: string }

// Wrappers that run the command after them; the value is their options that take an argument.
const WRAPPERS: Record<string, Set<string>> = {
  rtk: new Set(),
  sudo: new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-U']),
  env: new Set(['-u', '-C', '-S']),
  command: new Set(),
  nohup: new Set(),
  time: new Set(),
  nice: new Set(['-n']),
  xcrun: new Set(['--sdk', '--toolchain']),
}

const unquote = (word: string) => word.replace(/^['"]+|['"]+$/g, '')

const isAssignment = (word: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)

const baseName = (word: string) => word.slice(word.lastIndexOf('/') + 1)

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

/** Each simple command of a shell line: its raw text and its unquoted words, wrappers dropped. */
export function segments(command: string): { raw: string; words: string[] }[] {
  return command
    .split(/&&|\|\||[;|&\n]/)
    .map(part => ({ raw: part.trim(), words: strip(part.trim().split(/\s+/).filter(Boolean).map(unquote)) }))
    .filter(one => one.words.length > 0)
}

// The keychain item generate_keys writes: service, label and default account.
export const KEYCHAIN_SERVICE = 'https://sparkle-project.org'
export const KEYCHAIN_LABEL = 'Private key for signing Sparkle updates'
export const DEFAULT_ACCOUNT = 'ed25519'

const DELETES = new Set(['delete-generic-password', 'delete-internet-password'])

// `security delete-*-password` aimed at the Sparkle item: by service, label or the default account.
function deletesKey(raw: string, words: string[]): boolean {
  if (baseName(words[0] ?? '') !== 'security' || !DELETES.has(words[1] ?? '')) return false
  const text = raw.toLowerCase()
  if (text.includes('sparkle-project.org') || text.includes(KEYCHAIN_LABEL.toLowerCase())) return true
  const account = words.indexOf('-a')

  return account >= 0 && words[account + 1] === DEFAULT_ACCOUNT
}

const IMPORT = new Set(['-f', '--importedPrivateKeyFile'])
const READ_ONLY = new Set(['-p', '--lookUpPublicKey', '-x', '--exportedPrivateKeyFile', '-h', '--help'])

const flagName = (arg: string) => (arg.startsWith('--') && arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg)

// Why a generate_keys call may create or replace the key, or null when it only reads it.
function generateKeysRisk(args: string[]): Verdict | null {
  const flags = args.map(flagName)
  if (flags.some(flag => IMPORT.has(flag))) {
    return {
      decision: 'ask',
      reason:
        'sparkle-guard: generate_keys -f imports a private key into the keychain in place of the Sparkle signing key, so confirm only if it is the original key exported with -x.',
    }
  }
  if (flags.some(flag => READ_ONLY.has(flag))) return null

  return {
    decision: 'ask',
    reason:
      'sparkle-guard: generate_keys without -p or -x creates a new Sparkle signing key when it finds none in this keychain and account, which breaks auto-update for every installed user; use generate_keys -p to only print the public key.',
  }
}

/** The verdict on a Bash command line, or null when it leaves the Sparkle key alone. */
export function checkCommand(command: string): Verdict | null {
  let ask: Verdict | null = null
  for (const { raw, words } of segments(command)) {
    if (deletesKey(raw, words)) {
      return {
        decision: 'deny',
        reason:
          'sparkle-guard: deleting the Sparkle EdDSA private key from the keychain is blocked, because without it no update can ever be signed for the copies already installed.',
      }
    }
    if (baseName(words[0] ?? '') === 'generate_keys') ask = ask ?? generateKeysRisk(words.slice(1))
  }

  return ask
}

const PLIST = /<key>\s*SUPublicEDKey\s*<\/key>\s*<string>\s*([^<]*?)\s*<\/string>/g
const ASSIGNED = /(?:INFOPLIST_KEY_)?SUPublicEDKey["']?\s*[:=]\s*["']?([A-Za-z0-9+/=_.$(){}-]+)/g

/** Every SUPublicEDKey value in a text: plist, YAML, xcconfig/build setting or JSON. */
export function publicKeys(text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(PLIST)) found.push(match[1] ?? '')
  for (const match of text.matchAll(ASSIGNED)) found.push(match[1] ?? '')

  return found
}

export type Replacement = { old_string: string; new_string: string; replace_all?: boolean }

/** The text after an Edit's replacement: the first occurrence, or all with replace_all. */
export function applyEdit(text: string, edit: Replacement): string {
  if (edit.old_string === '') return text
  if (edit.replace_all === true) return text.split(edit.old_string).join(edit.new_string)
  const at = text.indexOf(edit.old_string)

  return at < 0 ? text : text.slice(0, at) + edit.new_string + text.slice(at + edit.old_string.length)
}

const short = (value: string) => (value.length > 12 ? `${value.slice(0, 12)}…` : value)

const sameValues = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i])

/**
 * The verdict when a file's text goes from `before` to `after`: asking when an existing
 * SUPublicEDKey value changes or disappears; adding one where there was none is fine.
 */
export function checkKeyChange(file: string, before: string | null, after: string): Verdict | null {
  const old = before === null ? [] : publicKeys(before)
  if (old.length === 0) return null
  const next = publicKeys(after)
  if (sameValues(old, next)) return null
  const what = next.length === 0 ? `removes SUPublicEDKey ${short(old[0]!)}` : `changes SUPublicEDKey from ${short(old[0]!)} to ${short(next.find(value => !old.includes(value)) ?? next[0]!)}`

  return {
    decision: 'ask',
    reason: `sparkle-guard: this edit ${what} in ${baseName(file)}, and installed apps only accept updates signed with the key matching the old value, so confirm only if you are rotating keys on purpose.`,
  }
}

export const RULES = [
  'deny: security delete-generic-password / delete-internet-password aimed at the Sparkle key (service https://sparkle-project.org, label "Private key for signing Sparkle updates", or account ed25519)',
  'ask: generate_keys without -p/--lookUpPublicKey or -x/--exportedPrivateKeyFile (it creates a new key when none is found)',
  'ask: generate_keys -f/--importedPrivateKeyFile (imports a key in place of the current one)',
  'ask: Edit/Write that changes or removes an existing SUPublicEDKey value (adding one is allowed)',
]
