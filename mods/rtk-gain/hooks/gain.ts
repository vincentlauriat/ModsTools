import type { Gain } from '../types'

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

// `rtk gain --format json` prints { summary: { total_saved, avg_savings_pct, ... } }.
export function parseGain(stdout: string): Gain | null {
  let data: unknown
  try {
    data = JSON.parse(stdout)
  } catch {
    return null
  }
  const summary = (data as { summary?: Record<string, unknown> } | null)?.summary
  if (summary === undefined || summary === null || typeof summary !== 'object') return null
  const saved = summary['total_saved']
  if (!finite(saved) || saved < 0) return null
  const percent = summary['avg_savings_pct']

  return { saved, percent: finite(percent) ? Math.round(percent) : null }
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`

  return String(Math.round(count))
}

export const statusLine = (gain: Gain) =>
  `rtk −${formatTokens(gain.saved)} tok${gain.percent === null ? '' : ` (${gain.percent}%)`}`
