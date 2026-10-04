export type State = { unlocked: string[]; bash: number; edit: number; tools: number; failed: string[] }

export type Ev =
  | { kind: 'tool'; tool: string; command?: string; isError: boolean; stdout?: string }
  | { kind: 'turn'; hour: number; durationMs: number }
  | { kind: 'spawn'; count: number }

export type Badge = { id: string; name: string; hint: string }

export const BADGES: Badge[] = [
  { id: 'first-blood', name: 'First Blood', hint: 'Make your first tool call' },
  { id: 'centurion', name: 'Centurion', hint: 'Run 100 Bash commands' },
  { id: 'wordsmith', name: 'Wordsmith', hint: 'Make 50 Edit calls' },
  { id: 'night-owl', name: 'Night Owl', hint: 'Finish a turn between 0:00 and 5:00' },
  { id: 'early-bird', name: 'Early Bird', hint: 'Finish a turn between 5:00 and 7:00' },
  { id: 'marathon', name: 'Marathon', hint: 'Complete a single turn that lasts 10 minutes or more' },
  { id: 'subagent-wrangler', name: 'Subagent Wrangler', hint: 'Spawn 5 subagents in one session' },
  { id: 'green-light', name: 'Green Light', hint: 'Get a test command to pass (npm test, vitest, jest, pytest, cargo test, claude plugin test...)' },
  { id: 'persistent', name: 'Persistent', hint: 'Re-run a failing Bash command until it succeeds' },
  { id: 'shipper', name: 'Shipper', hint: 'Complete a successful git push' },
  { id: 'clean-slate', name: 'Clean Slate', hint: 'Run git status on a clean working tree' },
]

const TEST_COMMAND = /(^|[\s;&|(])(npm\s+test|pnpm\s+test|yarn\s+test|vitest|jest|pytest|cargo\s+test|go\s+test|swift\s+test|claude\s+plugin\s+test)(\s|$)/
const GIT_PUSH = /(^|[\s;&|(])git\s+push(\s|$)/
const GIT_STATUS = /(^|[\s;&|(])git\s+status(\s|$)/
// English and French git, and rtk's compacted `git status`.
const CLEAN_TREE = /working tree clean|copie de travail est propre|^clean — nothing to commit/im
const MAX_FAILED = 30

export const EMPTY: State = { unlocked: [], bash: 0, edit: 0, tools: 0, failed: [] }

export function normalize(value: unknown): State {
  if (typeof value !== 'object' || value === null) return EMPTY
  const v = value as Partial<State>
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)
  const list = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [])

  return { unlocked: list(v.unlocked), bash: num(v.bash), edit: num(v.edit), tools: num(v.tools), failed: list(v.failed) }
}

function earned(s: State, e: Ev): string[] {
  if (e.kind === 'turn') {
    return [
      ...(e.hour >= 0 && e.hour < 5 ? ['night-owl'] : []),
      ...(e.hour >= 5 && e.hour < 7 ? ['early-bird'] : []),
      ...(e.durationMs >= 600_000 ? ['marathon'] : []),
    ]
  }
  if (e.kind === 'spawn') return e.count >= 5 ? ['subagent-wrangler'] : []
  const cmd = e.tool === 'Bash' ? (e.command ?? '').trim() : ''

  return [
    ...(s.tools >= 1 ? ['first-blood'] : []),
    ...(s.bash >= 100 ? ['centurion'] : []),
    ...(s.edit >= 50 ? ['wordsmith'] : []),
    ...(cmd !== '' && !e.isError && TEST_COMMAND.test(cmd) ? ['green-light'] : []),
    ...(cmd !== '' && !e.isError && s.failed.includes(cmd) ? ['persistent'] : []),
    ...(cmd !== '' && !e.isError && GIT_PUSH.test(cmd) ? ['shipper'] : []),
    ...(cmd !== '' && !e.isError && GIT_STATUS.test(cmd) && CLEAN_TREE.test(e.stdout ?? '') ? ['clean-slate'] : []),
  ]
}

export function applyEvent(prev: State, e: Ev): { state: State; unlocked: string[] } {
  let s = prev
  if (e.kind === 'tool') {
    const cmd = e.tool === 'Bash' ? (e.command ?? '').trim() : ''
    const failed = cmd === '' ? s.failed : e.isError ? [...s.failed.filter(c => c !== cmd), cmd].slice(-MAX_FAILED) : s.failed.filter(c => c !== cmd)
    s = { ...s, tools: s.tools + 1, bash: s.bash + (e.tool === 'Bash' ? 1 : 0), edit: s.edit + (e.tool === 'Edit' ? 1 : 0), failed }
  }
  const unlocked = [...new Set(earned(e.kind === 'tool' ? { ...s, failed: prev.failed } : s, e))].filter(id => !s.unlocked.includes(id))

  return { state: { ...s, unlocked: [...s.unlocked, ...unlocked] }, unlocked }
}

export function listing(s: State): string {
  const done = BADGES.filter(b => s.unlocked.includes(b.id))
  const lines = BADGES.map(b => (s.unlocked.includes(b.id) ? `✓ ${b.name}` : `○ ${b.name} — ${b.hint}`))

  return [`Achievements: ${done.length}/${BADGES.length}`, ...lines].join('\n')
}

export function badgeName(id: string): string {
  return BADGES.find(b => b.id === id)?.name ?? id
}
