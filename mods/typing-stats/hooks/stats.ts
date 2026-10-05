export const KEEP_DAYS = 90
export const BLOCKS = '▁▂▃▄▅▆▇█'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BAR_WIDTH = 20

/** One local day: prompt count, total characters, prompts per hour (24 buckets). Never the text. */
export type Day = { count: number; chars: number; hours: number[] }
export type Days = Record<string, Day>

export function dayKey(ms: number): string {
  const d = new Date(ms)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Calendar day number, DST-proof: computed from the key's y/m/d in UTC.
export function dayNumber(key: string): number {
  const [y = 0, m = 1, d = 1] = key.split('-').map(Number)

  return Date.UTC(y, m - 1, d) / 86_400_000
}

function keyOfNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10)
}

/** The `count` day keys ending today, oldest first. */
export function lastDays(today: string, count: number): string[] {
  const t = dayNumber(today)

  return Array.from({ length: count }, (_, i) => keyOfNumber(t - count + 1 + i))
}

const emptyDay = (): Day => ({ count: 0, chars: 0, hours: Array.from({ length: 24 }, () => 0) })

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Whatever the store held, as well-formed days (bad entries dropped). */
export function normalize(value: unknown): Days {
  const out: Days = {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || raw === null || typeof raw !== 'object') continue
    const d = raw as Partial<Day>
    if (!isNum(d.count) || !isNum(d.chars) || !Array.isArray(d.hours) || d.hours.length !== 24 || !d.hours.every(isNum)) continue
    out[key] = { count: d.count, chars: d.chars, hours: [...d.hours] }
  }

  return out
}

/** Characters of a prompt, counted as code points (an emoji is one). */
export const promptLength = (text: string) => [...text].length

/** Adds one prompt of `length` characters at local time `ms`; drops days older than KEEP_DAYS. */
export function record(days: Days, ms: number, length: number): Days {
  const key = dayKey(ms)
  const day = days[key] ?? emptyDay()
  const hours = [...day.hours]
  const hour = new Date(ms).getHours()
  hours[hour] = (hours[hour] ?? 0) + 1
  const next: Days = { ...days, [key]: { count: day.count + 1, chars: day.chars + length, hours } }

  return prune(next, key)
}

export function prune(days: Days, today: string): Days {
  const oldest = dayNumber(today) - KEEP_DAYS + 1
  const out: Days = {}
  for (const [key, day] of Object.entries(days)) if (dayNumber(key) >= oldest) out[key] = day

  return out
}

/** 24 columns of ▁..█; an empty hour is ▁, any non-empty hour at least ▂. */
export function sparkline(values: number[]): string {
  const max = Math.max(0, ...values)

  return values.map(v => (v <= 0 || max === 0 ? BLOCKS[0] : BLOCKS[Math.max(1, Math.ceil((v / max) * (BLOCKS.length - 1)))])).join('')
}

export function bar(value: number, max: number): string {
  if (value <= 0 || max <= 0) return ''

  return '█'.repeat(Math.max(1, Math.round((value / max) * BAR_WIDTH)))
}

export function busiestHour(hours: number[]): number | undefined {
  let best: number | undefined
  hours.forEach((v, h) => {
    if (v > 0 && (best === undefined || v > (hours[best] ?? 0))) best = h
  })

  return best
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

export type Period = 'default' | 'week' | 'month'

/** The /typing-stats report: today, a per-day bar list, average length and hour histogram over the period. */
export function report(days: Days, today: string, period: Period): string {
  const span = period === 'month' ? 30 : 7
  const keys = lastDays(today, span)
  const picked = keys.map(k => ({ key: k, day: days[k] ?? emptyDay() }))
  const count = picked.reduce((s, p) => s + p.day.count, 0)
  const chars = picked.reduce((s, p) => s + p.day.chars, 0)
  const hours = Array.from({ length: 24 }, (_, h) => picked.reduce((s, p) => s + (p.day.hours[h] ?? 0), 0))
  const label = period === 'month' ? 'Last 30 days' : 'Last 7 days'
  const t = days[today] ?? emptyDay()
  const lines: string[] = []

  if (period === 'default') {
    lines.push(`Today: ${plural(t.count, 'prompt')}, ${plural(t.chars, 'character')}${t.count > 0 ? ` (avg ${Math.round(t.chars / t.count)})` : ''}`, '')
  }
  lines.push(`${label}: ${plural(count, 'prompt')}`)
  const max = Math.max(0, ...picked.map(p => p.day.count))
  for (const p of picked) {
    const name = WEEKDAYS[new Date(dayNumber(p.key) * 86_400_000).getUTCDay()]
    const b = bar(p.day.count, max)
    lines.push(`  ${name} ${p.key.slice(5)}  ${String(p.day.count).padStart(4)}  ${b}`.trimEnd())
  }
  lines.push('', `Average prompt length: ${count > 0 ? `${Math.round(chars / count)} characters` : '-'}`)
  lines.push('', `Hour of day (${label.toLowerCase()}):`, `  ${sparkline(hours)}`, '  0     6     12    18   23')
  const busy = busiestHour(hours)
  lines.push(busy === undefined ? 'Busiest hour: -' : `Busiest hour: ${hh(busy)}-${hh((busy + 1) % 24)} (${plural(hours[busy] ?? 0, 'prompt')})`)

  return lines.join('\n')
}
