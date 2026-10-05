// Pure logic: which language a path belongs to, and which languages a Bash command builds or type-checks.

const EXTENSIONS: Record<string, string> = {
  swift: 'Swift',
  ts: 'TS/JS',
  tsx: 'TS/JS',
  js: 'TS/JS',
  jsx: 'TS/JS',
  mjs: 'TS/JS',
  cjs: 'TS/JS',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  kt: 'Kotlin/Java',
  java: 'Kotlin/Java',
  c: 'C/ObjC',
  cc: 'C/ObjC',
  cpp: 'C/ObjC',
  m: 'C/ObjC',
  mm: 'C/ObjC',
  h: 'C/ObjC',
}

// The language of a source path, or null when it is not source code.
export function languageOf(path: string): string | null {
  const match = /\.([A-Za-z]+)$/.exec(path)

  const extension = match?.[1]

  return extension !== undefined && Object.hasOwn(EXTENSIONS, extension) ? (EXTENSIONS[extension] ?? null) : null
}

const WRAPPERS = /^(?:sudo|npx|bunx|time|env|nohup)\s+/
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/
const RTK_SUBCOMMAND = /^(?:err|test|proxy|summary)\s+(?=\S)/
const CHECKS: [RegExp, string[]][] = [
  [/^xcodebuild\b/, ['Swift', 'C/ObjC']],
  [/^swift\s+(?:build|test)\b/, ['Swift']],
  [/^(?:tsc|vitest|jest)\b/, ['TS/JS']],
  [/^(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:build|test|lint|typecheck)\b/, ['TS/JS']],
  [/^claude\s+plugin\s+(?:test|validate)\b/, ['TS/JS']],
  [/^(?:pytest|mypy|ruff)\b/, ['Python']],
  [/^python3?\s+-m\s+pytest\b/, ['Python']],
  [/^cargo\s+(?:build|test|check|clippy|run)\b/, ['Rust']],
  [/^go\s+(?:build|test|vet)\b/, ['Go']],
  [/^(?:make|clang(?:\+\+)?)\b/, ['C/ObjC']],
  [/^(?:gradle|\.\/gradlew|mvn)\b/, ['Kotlin/Java']],
]

function segmentLanguages(segment: string): string[] {
  let rest = segment.trim().replace(/^[({]\s*/, '')
  for (;;) {
    let stripped = rest.replace(WRAPPERS, '').replace(ENV_ASSIGN, '')
    if (/^rtk\s+/.test(stripped)) stripped = stripped.replace(/^rtk\s+/, '').replace(RTK_SUBCOMMAND, '')
    if (stripped === rest) break
    rest = stripped
  }

  return CHECKS.filter(([pattern]) => pattern.test(rest)).flatMap(([, languages]) => languages)
}

// The languages covered by the build, test or type-check commands in a shell command.
export function checkLanguages(command: string): string[] {
  return [...new Set(command.split(/&&|\|\||;|\n/).flatMap(segmentLanguages))]
}

// Band text for the languages still unverified.
export const bandText = (languages: string[]): string => `⚙ build-gate: ${languages.join(', ')} changed, no build run this turn`
