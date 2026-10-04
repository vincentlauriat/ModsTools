export const DEFAULT_MINUTES = 25

export function parseMinutes(arg: string): number | null {
  if (arg === '') return DEFAULT_MINUTES
  if (!/^\d+$/.test(arg)) return null
  const n = Number(arg)

  return n >= 1 && n <= 480 ? n : null
}

export function minutesLeft(endsAt: number, now: number): number {
  return Math.max(1, Math.ceil((endsAt - now) / 60_000))
}

export function bandText(endsAt: number, now: number): string {
  return `🎯 Focus ${minutesLeft(endsAt, now)} min left`
}
