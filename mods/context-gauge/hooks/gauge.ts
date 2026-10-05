export const THRESHOLD = 70
export const DANGER = 90

export function bar(percent: number, width = 10): string {
  const filled = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))

  return '▓'.repeat(filled) + '░'.repeat(width - filled)
}

export const label = (percent: number): string => `Context ${Math.round(percent)}% ${bar(percent)} — consider /compact`

export const isShown = (percent: number | null): percent is number => percent !== null && percent >= THRESHOLD
