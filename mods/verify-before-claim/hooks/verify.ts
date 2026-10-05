// Pure logic: which Bash commands count as a check, and whether prose claims success.

const WRAPPERS = /^(?:sudo|npx|bunx|time|env|nohup)\s+/
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/
const CHECKS: RegExp[] = [
  /^xcodebuild\b/,
  /^swift\s+(?:build|test)\b/,
  /^(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:build|test|lint)\b/,
  /^(?:tsc|vitest|jest|pytest|swiftlint|eslint)\b/,
  /^python3?\s+-m\s+pytest\b/,
  /^cargo\s+(?:build|test|check|clippy)\b/,
  /^go\s+(?:build|test|vet)\b/,
  /^make\b/,
  /^(?:gradle|\.\/gradlew)\b/,
  /^claude\s+plugin\s+(?:test|validate)\b/,
]

function isCheckSegment(segment: string): boolean {
  let rest = segment.trim()
  let isProxied = false
  for (;;) {
    const stripped = rest.replace(/^rtk\s+/, () => ((isProxied = true), '')).replace(WRAPPERS, '').replace(ENV_ASSIGN, '')
    if (stripped === rest) break
    rest = stripped
  }
  if (isProxied && /^(?:err|test)\s+\S/.test(rest)) return true

  return CHECKS.some(pattern => pattern.test(rest))
}

// Whether any segment of a shell command (split on && ; || and newlines) is a build, test or lint run.
export function isCheckCommand(command: string): boolean {
  return command.split(/&&|\|\||;|\n/).some(isCheckSegment)
}

// Whether a changed path is code: everything except Markdown and plain text.
export const isCodePath = (path: string): boolean => !/\.(?:md|txt)$/i.test(path)

const L = String.raw`(?<![\p{L}])`
const R = String.raw`(?![\p{L}])`
const CLAIMS = new RegExp(
  L +
    '(?:' +
    [
      'corrigée?s?',
      'résolu(?:e|es|s)?',
      'ça (?:marche|fonctionne)',
      'ca (?:marche|fonctionne)',
      'tests? (?:passe|passent|(?:sont|est) (?:au vert|verts?))',
      'tous les tests passent',
      'build réussi',
      'tout passe',
      'terminée?s?',
      'c.est bon',
      'fixed',
      'works now',
      'now works',
      'it works',
      'all tests (?:pass|are passing)',
      'tests? (?:pass|passing)',
      'build (?:succeeds|succeeded|is green)',
      'builds successfully',
      'done',
    ].join('|') +
    ')' +
    R,
  'iu',
)
// Sentences that deny, ask or only suppose are not claims.
const HEDGES = /\b(?:pas|jamais|not|never|no|if|once|unless|si)\b|n['’]t\b|\bn['’]/iu

function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?(?:```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ')
}

// The first success phrase found in the prose of an answer (code stripped), or null.
export function findClaim(answer: string): string | null {
  const sentences = stripCode(answer).split(/(?<=[.!?:;])\s+|\n+/)
  for (const sentence of sentences) {
    const s = sentence.trim()
    if (s === '' || s.endsWith('?') || HEDGES.test(s)) continue
    const match = CLAIMS.exec(s)
    if (match !== null) return match[0].toLowerCase()
  }

  return null
}
