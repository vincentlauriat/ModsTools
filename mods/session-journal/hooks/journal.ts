export type Entry = { time: number; project: string; prompt: string; tools: number; files: number }

export const MAX_DAYS = 30
export const MAX_ENTRIES = 2000
export const PROMPT_MAX = 80
const DAY_MS = 86_400_000

export function firstLine(text: string): string {
  const line = text.split('\n').find(l => l.trim() !== '')?.trim() ?? ''

  return line.length > PROMPT_MAX ? `${line.slice(0, PROMPT_MAX - 1)}…` : line
}

export function projectName(cwd: string): string {
  return cwd.split('/').filter(Boolean).pop() ?? cwd
}

// Appends, drops entries older than 30 days, keeps the newest 2000.
export function addEntry(entries: readonly Entry[], entry: Entry, now: number): Entry[] {
  const kept = [...entries, entry].filter(e => now - e.time <= MAX_DAYS * DAY_MS)

  return kept.slice(-MAX_ENTRIES)
}

const pad = (n: number) => String(n).padStart(2, '0')

export function dayKey(ms: number): string {
  const d = new Date(ms)

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const clock = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Entries of the local day containing `ms`, grouped by project.
export function formatDay(entries: readonly Entry[], ms: number): string {
  const key = dayKey(ms)
  const day = entries.filter(e => dayKey(e.time) === key)
  if (day.length === 0) return `No journal entries for ${key}.`
  const byProject = new Map<string, Entry[]>()
  for (const e of day) byProject.set(e.project, [...(byProject.get(e.project) ?? []), e])
  const lines = [`Journal ${key}`]
  for (const [project, list] of byProject) {
    lines.push('', `${project} (${plural(list.length, 'turn')})`)
    for (const e of list) {
      lines.push(`  ${clock(e.time)} ${e.prompt || '(no prompt)'} · ${plural(e.tools, 'tool')} · ${plural(e.files, 'file')}`)
    }
  }

  return lines.join('\n')
}

// Turn counts per day then project over the 7 days ending at `now`, newest day first.
export function formatWeek(entries: readonly Entry[], now: number): string {
  const lines = ['Journal, last 7 days']
  let total = 0
  for (let i = 0; i < 7; i++) {
    const key = dayKey(now - i * DAY_MS)
    const counts = new Map<string, number>()
    for (const e of entries) if (dayKey(e.time) === key) counts.set(e.project, (counts.get(e.project) ?? 0) + 1)
    if (counts.size === 0) continue
    const n = [...counts.values()].reduce((a, b) => a + b, 0)
    total += n
    lines.push(`${key}: ${[...counts].map(([p, c]) => `${p} ${c}`).join(', ')}`)
  }

  return total === 0 ? 'No journal entries in the last 7 days.' : [...lines, `Total: ${plural(total, 'turn')}`].join('\n')
}
