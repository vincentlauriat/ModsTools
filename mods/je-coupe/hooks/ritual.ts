export const DOCS = [
  'COMMANDS.md',
  'CHANGES.md',
  'MEMORY.md',
  'TODOS.md',
  'PLAN.md',
  'README.md',
  'ARCHITECTURE.md',
  'ARCHITECTURE_EN.md',
] as const

export type DocStat = { name: string; mtimeMs: number }

export function isJeCoupe(text: string): boolean {
  const norm = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  return norm === 'je coupe' || norm.startsWith('je coupe ')
}

export const staleDocs = (docs: DocStat[], startedAt: number) =>
  docs.filter(d => d.mtimeMs < startedAt).map(d => d.name)

export function instruction(docs: DocStat[], startedAt: number): string {
  const stale = new Set(staleDocs(docs, startedAt))
  const list = docs.map(d => (stale.has(d.name) ? `${d.name} (NOT modified this session)` : d.name)).join(', ')

  return `End of session: before stopping, bring all these doc files up to date with the work done: ${list}.`
}

export function bandLabel(stale: string[]): string {
  return `Je coupe: ${stale.length} doc${stale.length === 1 ? '' : 's'} not updated yet: ${stale.join(', ')}`
}
