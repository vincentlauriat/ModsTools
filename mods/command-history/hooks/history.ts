import type { HistoryEntry } from '../types'

export const CAP = 50

// Bash's result carries no exit code: a non-zero exit comes back as an error whose
// text starts "Exit code N", so that is where the code is read from.
export function statusOf(ran: { deny?: string; isError?: boolean; text?: string; result?: unknown }): string {
  if (ran.deny !== undefined) return 'denied'
  if (ran.isError === true) {
    const code = /^Exit code (\d+)/.exec(ran.text ?? '')?.[1]
    return code === undefined ? '✗' : `✗ ${code}`
  }
  const out = ran.result as { interrupted?: boolean } | undefined
  return out?.interrupted === true ? 'interrupted' : '✓'
}

export const push = (list: HistoryEntry[], entry: HistoryEntry) => [entry, ...list].slice(0, CAP)

export const duration = (ms: number) => (ms < 1000 ? `${Math.max(0, Math.round(ms))}ms` : `${(ms / 1000).toFixed(1)}s`)

const oneLine = (command: string) => command.trim().split('\n')[0]?.replace(/\s+/g, ' ') ?? ''

// "<status> <command> · <duration>", the command cut so the row fits `columns`.
export function row(entry: HistoryEntry, columns: number): string {
  const head = `${entry.status} `
  const tail = ` · ${duration(entry.ms)}`
  const room = Math.max(8, columns - head.length - tail.length)
  const line = oneLine(entry.command)
  const shown = line.length > room ? line.slice(0, room - 1) + '…' : line

  return head + shown + tail
}
