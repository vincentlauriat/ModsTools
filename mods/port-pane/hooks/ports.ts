// Pure logic of port-pane: reading `lsof -F` field output and deciding which listeners may be stopped.

import type { PortRow } from '../types'

export const UNAVAILABLE = 'lsof unavailable'

export type Listener = { pid: number; command: string; login: string; ports: number[] }

// lsof -F escapes bytes it will not print as \xNN (a space in a command name is \x20) and a backslash as \\.
export function decode(text: string): string {
  return text.replace(/\\x([0-9a-fA-F]{2})|\\\\/g, (whole, hex: string | undefined) => (hex === undefined ? '\\' : String.fromCharCode(parseInt(hex, 16))))
}

// The port of an lsof name field: `*:3000`, `127.0.0.1:8080`, `[::1]:5177`; null for anything else.
export function portOf(name: string): number | null {
  const match = /:(\d+)$/.exec(name.trim())
  if (match === null) return null
  const port = Number(match[1])

  return port > 0 && port < 65536 ? port : null
}

// Groups `lsof -nP -iTCP -sTCP:LISTEN -F pcnL` output by process: p=pid, c=command, L=login, n=address.
// Other field letters (lsof always adds f=fd) are skipped. Sorted by pid, ports ascending and unique.
export function parseListeners(stdout: string): Listener[] {
  const byPid = new Map<number, Listener>()
  let current: Listener | null = null
  for (const line of stdout.split('\n')) {
    const field = line[0]
    const value = line.slice(1)
    if (field === 'p') {
      const pid = Number(value)
      if (!Number.isInteger(pid) || pid <= 0) {
        current = null
        continue
      }
      current = byPid.get(pid) ?? { pid, command: '', login: '', ports: [] }
      byPid.set(pid, current)
    } else if (current === null) continue
    else if (field === 'c') current.command = decode(value)
    else if (field === 'L') current.login = decode(value)
    else if (field === 'n') {
      const port = portOf(value)
      if (port !== null && !current.ports.includes(port)) current.ports.push(port)
    }
  }

  return [...byPid.values()]
    .filter(one => one.ports.length > 0)
    .map(one => ({ ...one, ports: [...one.ports].sort((a, b) => a - b) }))
    .sort((a, b) => a.pid - b.pid)
}

// `lsof -a -p <pids> -d cwd -F n` output: the working folder of each pid.
export function parseCwds(stdout: string): Map<number, string> {
  const cwds = new Map<number, string>()
  let pid: number | null = null
  for (const line of stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    else if (line.startsWith('n') && pid !== null && Number.isInteger(pid)) cwds.set(pid, decode(line.slice(1)))
  }

  return cwds
}

export const keysOf = (one: { pid: number; ports: number[] }): string[] => one.ports.map(port => `${one.pid}:${port}`)

// Whether a port of this listener was not listening when the session started.
export const isNew = (one: { pid: number; ports: number[] }, baseline: readonly string[]): boolean => keysOf(one).some(key => !baseline.includes(key))

export function toRows(listeners: Listener[], baseline: readonly string[], cwds: ReadonlyMap<number, string>): PortRow[] {
  const rows = listeners.map(one => ({ ...one, cwd: cwds.get(one.pid) ?? null, isNew: isNew(one, baseline) }))

  return [...rows.filter(row => row.isNew), ...rows.filter(row => !row.isNew)]
}

// System and desktop apps that listen on local ports and are never offered a Stop button.
export const DENY = new Set([
  'launchd',
  'ControlCenter',
  'rapportd',
  'sharingd',
  'identityservicesd',
  'WindowServer',
  'loginwindow',
  'Finder',
  'Dock',
  'SystemUIServer',
  'mDNSResponder',
  'Spotify',
  'Dropbox',
  'OneDrive',
  'Google Chrome',
  'Safari',
  'Slack',
  'zoom.us',
])

export type Verdict = { ok: true } | { ok: false; reason: string; hard: boolean }

// Hard refusals (another user, pid < 100, a denied command) always win; the "Allow stop" toggle only
// lifts the rule that the port must have been first seen during this session.
export function canStop(row: { pid: number; command: string; login: string; isNew: boolean }, user: string | null, allowed: readonly number[]): Verdict {
  if (user === null || row.login !== user) return { ok: false, reason: 'owned by another user', hard: true }
  if (row.pid < 100) return { ok: false, reason: 'system process', hard: true }
  if (DENY.has(row.command)) return { ok: false, reason: 'system or desktop app', hard: true }
  if (!row.isNew && !allowed.includes(row.pid)) return { ok: false, reason: 'listening before this session', hard: false }

  return { ok: true }
}

// The number of ports first seen during this session among the user's listeners.
export function newPortCount(rows: readonly PortRow[], user: string | null): number {
  return new Set(rows.filter(row => row.isNew && row.login === user).flatMap(row => row.ports)).size
}

export const statusText = (count: number): string | undefined => (count === 0 ? undefined : `🔌 ${count} dev port${count === 1 ? '' : 's'}`)

export function rowLabel(row: PortRow): string {
  const ports = row.ports.map(port => `:${port}`).join(' ')

  return `${row.isNew ? '● ' : ''}${row.command} · pid ${row.pid} · ${ports}`
}

export function countLabel(rows: readonly PortRow[]): string {
  const fresh = rows.filter(row => row.isNew).length
  if (rows.length === 0) return 'No TCP listener'

  return `${rows.length} listening process${rows.length === 1 ? '' : 'es'} · ${fresh} new this session`
}
