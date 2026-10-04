export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

const NAMES: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

export const limitName = (kind: string): string => NAMES[kind] ?? kind

export function worstLimit(limits: readonly Limit[]): Limit | undefined {
  return limits.reduce<Limit | undefined>((worst, l) => (worst === undefined || l.percentUsed > worst.percentUsed ? l : worst), undefined)
}

export function statusLine(usd: number | undefined, limits: readonly Limit[]): string | undefined {
  const worst = worstLimit(limits)
  const parts = [
    usd === undefined ? undefined : `$${usd.toFixed(2)}`,
    worst === undefined ? undefined : `${limitName(worst.kind)} ${Math.round(worst.percentUsed)}%`,
  ].filter((p): p is string => p !== undefined)

  return parts.length === 0 ? undefined : parts.join(' · ')
}

export function duration(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))

  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}m`
}

export function summary(usd: number | undefined, limits: readonly Limit[], startedAt: number, now: number): string {
  const lines = [
    `Cost: ${usd === undefined ? 'not available' : `$${usd.toFixed(2)}`}`,
    ...limits.map(l => `Rate limit ${limitName(l.kind)}: ${l.percentUsed}% used${l.resetsAt === undefined ? '' : `, resets ${l.resetsAt}`}`),
    `Session duration: ${duration(now - startedAt)}`,
  ]

  return lines.join('\n')
}
