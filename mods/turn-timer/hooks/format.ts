export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total}s`

  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`
}
