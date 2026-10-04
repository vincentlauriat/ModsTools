import type { AgentRow } from '../types'

const ICONS = { running: '⏳', done: '✓', failed: '✗' } as const

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total}s`

  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`
}

export const label = (description: string, type: string) => (description.trim() === '' ? type : `${type}: ${description.trim()}`)

export const rowText = (row: AgentRow, now: number) =>
  `${ICONS[row.status]} ${row.label} · ${formatDuration((row.endedAt ?? now) - row.startedAt)}`

// A turn that ended in anything but an answer (interrupt, API error, refusal) failed.
export const statusOf = (reason: string): AgentRow['status'] => (reason === 'answer' ? 'done' : 'failed')

export function finish(rows: AgentRow[], id: string, reason: string, now: number): AgentRow[] {
  return rows.map(row => (row.id === id ? { ...row, status: statusOf(reason), endedAt: now } : row))
}
