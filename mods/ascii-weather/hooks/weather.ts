export const REFRESH_MS = 3_600_000

const COORDS = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?:?$/
const REJECT = /<|unknown location|not found|upstream error|sorry|error/i

export function weatherUrl(location: string, format: string): string {
  return `https://wttr.in/${encodeURIComponent(location.trim())}?format=${encodeURIComponent(format)}&m`
}

export function parseWeather(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (text === '' || text.length > 100 || REJECT.test(text)) return null
  const words = text.split(' ').filter(word => !COORDS.test(word))
  const out = words.join(' ')

  return out === '' ? null : out
}
