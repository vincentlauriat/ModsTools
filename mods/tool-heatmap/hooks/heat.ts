import type { HeatmapTool } from '../types'

const NAME_MAX = 20

export function count(list: HeatmapTool[], tool: string, isFailure: boolean): HeatmapTool[] {
  const found = list.find(one => one.tool === tool) ?? { tool, calls: 0, failures: 0 }
  const counted = { tool, calls: found.calls + 1, failures: found.failures + (isFailure ? 1 : 0) }

  return [...list.filter(one => one.tool !== tool), counted]
}

export const sorted = (list: HeatmapTool[]) =>
  [...list].sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool))

export function total(list: HeatmapTool[]): string {
  const calls = list.reduce((sum, one) => sum + one.calls, 0)
  const failures = list.reduce((sum, one) => sum + one.failures, 0)

  return `${calls} call${calls === 1 ? '' : 's'} · ${failures} failed · ${list.length} tool${list.length === 1 ? '' : 's'}`
}

const fit = (name: string, width: number) =>
  name.length > width ? name.slice(0, width - 1) + '…' : name.padEnd(width)

/** One line per tool, most called first: name, a bar scaled to the top tool, count and failures. */
export function rows(list: HeatmapTool[], columns: number): string[] {
  const ordered = sorted(list)
  const top = ordered[0]?.calls ?? 0
  const nameWidth = Math.min(NAME_MAX, Math.max(0, ...ordered.map(one => one.tool.length)))
  const tailWidth = Math.max(0, ...ordered.map(one => tail(one).length))
  const barWidth = Math.max(1, columns - nameWidth - tailWidth - 2)

  return ordered.map(one => {
    const bar = '█'.repeat(Math.max(1, Math.round((one.calls / top) * barWidth)))

    return `${fit(one.tool, nameWidth)} ${bar.padEnd(barWidth)} ${tail(one)}`.trimEnd()
  })
}

const tail = (one: HeatmapTool) => `${one.calls}${one.failures > 0 ? ` (${one.failures}✗)` : ''}`
