export const KEEP_DAYS = 400
export const MILESTONES = [7, 30, 100, 365]

export type Stats = { current: number; longest: number; total: number }

export function dayKey(ms: number): string {
  const d = new Date(ms)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Calendar day number, DST-proof: computed from the key's y/m/d in UTC.
export function dayNumber(key: string): number {
  const [y = 0, m = 1, d = 1] = key.split('-').map(Number)

  return Date.UTC(y, m - 1, d) / 86_400_000
}

export function addDay(days: string[], key: string): string[] {
  const set = new Set(days)
  set.add(key)

  return [...set].sort().slice(-KEEP_DAYS)
}

export function stats(days: string[], today: string): Stats {
  const nums = [...new Set(days.map(dayNumber))].sort((a, b) => a - b)
  let longest = 0
  let run = 0
  let prev = Number.NaN
  for (const n of nums) {
    run = n === prev + 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = n
  }
  // The streak is still alive when its last day is today or yesterday.
  const last = nums[nums.length - 1]
  const t = dayNumber(today)
  const current = last !== undefined && (last === t || last === t - 1) ? run : 0

  return { current, longest, total: nums.length }
}

export function crossedMilestone(before: number, after: number): number | undefined {
  return [...MILESTONES].reverse().find(m => before < m && after >= m)
}

export function statusLine(current: number): string | undefined {
  if (current <= 0) return undefined

  return current === 1 ? '🔥 1 day' : `🔥 ${current}-day streak`
}

export function summary(s: Stats): string {
  return [`Current streak: ${s.current} day${s.current === 1 ? '' : 's'}`, `Longest streak: ${s.longest}`, `Active days: ${s.total}`].join('\n')
}
