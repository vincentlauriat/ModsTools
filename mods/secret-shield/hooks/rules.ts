export type Finding = { kind: string; preview: string }

// Order matters: Anthropic before the generic sk- of OpenAI.
const PATTERNS: { kind: string; re: RegExp; mixed?: boolean }[] = [
  { kind: 'Anthropic API key', re: /(?<![\w-])sk-ant-[A-Za-z0-9_-]{20,}/g, mixed: true },
  { kind: 'OpenAI API key', re: /(?<![\w-])sk-(?!ant-)[A-Za-z0-9_-]{20,}/g, mixed: true },
  { kind: 'GitHub token', re: /(?<![\w-])gh[pos]_[A-Za-z0-9]{20,}/g, mixed: true },
  { kind: 'GitHub token', re: /(?<![\w-])github_pat_[A-Za-z0-9_]{22,}/g, mixed: true },
  { kind: 'AWS access key id', re: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g },
  { kind: 'Slack token', re: /(?<![\w-])xox[baprs]-[A-Za-z0-9-]{10,}/g, mixed: true },
  { kind: 'Google API key', re: /(?<![\w-])AIza[0-9A-Za-z_-]{35}/g },
  { kind: 'private key', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----(?:\s|\\[rn])*[A-Za-z0-9+/=]{20,}/g },
]

const PLACEHOLDER_WORDS = /example|x{4}|your|placeholder|redacted|dummy|fake|sample|changeme/i

// Placeholders: doc words, too few distinct characters, or (for random tokens) no digit/letter mix.
function isPlaceholder(token: string, mixed: boolean): boolean {
  const body = token.replace(/^(sk-ant-|sk-|gh[pos]_|github_pat_|AKIA|xox[baprs]-|AIza)/, '')
  if (token.startsWith('-----BEGIN')) return false
  if (PLACEHOLDER_WORDS.test(body)) return true
  if (new Set(body.replace(/[-_]/g, '').toLowerCase()).size < 6) return true

  return mixed && !(/[0-9]/.test(body) && /[A-Za-z]/.test(body))
}

export const mask = (secret: string) => `${secret.slice(0, 4)}****`

/** The first secret-looking value in the text, or null when it is clean. */
export function findSecret(text: string): Finding | null {
  for (const { kind, re, mixed } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (!isPlaceholder(m[0], mixed === true)) return { kind, preview: mask(m[0]) }
    }
  }

  return null
}
