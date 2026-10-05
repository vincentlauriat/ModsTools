export function shouldPlay(ms: number, minSeconds: number): boolean {
  return ms >= minSeconds * 1000
}
