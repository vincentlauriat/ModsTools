// Pure logic: per-turn counting, the toast decision, today's peak and the summary.
import type { TurnCount } from '../types'

export const DEFAULT_MAX = 10
export const FRESH: TurnCount = { count: 0, toasted: false }

export type Today = { day: string; max: number }

// One more spawn this turn; toasts once, the first time the count goes over the budget.
export function bump(turn: TurnCount, max: number, enabled: boolean): { turn: TurnCount; toast: boolean } {
  const count = turn.count + 1
  const toast = enabled && count > max && !turn.toasted

  return { turn: { count, toasted: turn.toasted || toast }, toast }
}

export const toastText = (count: number, max: number): string =>
  `subagent-budget: ${count} subagents this turn (budget ${max})`

// Local calendar day of a clock reading, YYYY-MM-DD.
export function dayKey(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const isToday = (v: unknown): v is Today =>
  typeof v === 'object' && v !== null && typeof (v as Today).day === 'string' && typeof (v as Today).max === 'number'

// Today's peak per-turn count, given what the store held (another day's record starts over).
export function peak(stored: unknown, day: string, count: number): Today {
  const prev = isToday(stored) && stored.day === day ? stored.max : 0

  return { day, max: Math.max(prev, count) }
}

export function summary(count: number, today: number, max: number, enabled: boolean): string {
  return [
    `Subagents this turn: ${count}`,
    `Max in one turn today: ${today}`,
    `Budget: ${max} per turn${enabled ? '' : ' (alerts off)'}`,
  ].join('\n')
}
