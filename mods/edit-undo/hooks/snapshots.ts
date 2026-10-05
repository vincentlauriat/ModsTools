import type { SkippedFile, SnapshotMeta } from '../types'

export const MAX_PER_FILE = 20
export const MAX_FILE_BYTES = 1024 * 1024
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024
export const MAX_SNAPSHOTS = 2000
export const MAX_SKIPPED = 50

export type Limits = { perFile: number; totalBytes: number; count: number }
export const LIMITS: Limits = { perFile: MAX_PER_FILE, totalBytes: MAX_TOTAL_BYTES, count: MAX_SNAPSHOTS }

const encoder = new TextEncoder()

export const utf8Bytes = (text: string) => encoder.encode(text).length

// A text read of a file that is not UTF-8 replaces bytes with U+FFFD: writing it back would damage the file.
export const isLossy = (text: string) => text.includes('�')

// An absolute path with `.`, `..` and repeated slashes resolved; relative paths are taken under `cwd`.
export function resolvePath(path: string, cwd: string): string {
  const joined = path.startsWith('/') ? path : `${cwd.replace(/\/+$/, '')}/${path}`
  const parts: string[] = []
  for (const part of joined.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }

  return `/${parts.join('/')}`
}

// The path relative to `cwd` when it is inside it, otherwise as is.
export function displayPath(path: string, cwd: string): string {
  const root = cwd.replace(/\/+$/, '')

  return root !== '' && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
}

// Which snapshots to drop so the index fits: per file, then in count and size, oldest first.
export function evictions(index: readonly SnapshotMeta[], limits: Limits = LIMITS): string[] {
  const byAge = [...index].sort((a, b) => a.time - b.time)
  const drop = new Set<string>()
  const perPath = new Map<string, SnapshotMeta[]>()
  for (const one of byAge) perPath.set(one.path, [...(perPath.get(one.path) ?? []), one])
  for (const list of perPath.values()) for (const one of list.slice(0, Math.max(0, list.length - limits.perFile))) drop.add(one.id)
  let count = index.length - drop.size
  let bytes = index.reduce((sum, one) => sum + (drop.has(one.id) ? 0 : one.bytes), 0)
  for (const one of byAge) {
    if (count <= limits.count && bytes <= limits.totalBytes) break
    if (drop.has(one.id)) continue
    drop.add(one.id)
    count -= 1
    bytes -= one.bytes
  }

  return [...drop]
}

// The snapshots of one path, oldest first; the last is the one an undo restores.
export const stackOf = (index: readonly SnapshotMeta[], path: string) =>
  index.filter(one => one.path === path).sort((a, b) => a.time - b.time)

export type FileRow = { path: string; count: number; last: SnapshotMeta }

// One row per file, most recently changed first.
export function fileRows(index: readonly SnapshotMeta[]): FileRow[] {
  const rows = new Map<string, FileRow>()
  for (const one of index) {
    const row = rows.get(one.path)
    if (row === undefined) rows.set(one.path, { path: one.path, count: 1, last: one })
    else rows.set(one.path, { path: one.path, count: row.count + 1, last: one.time >= row.last.time ? one : row.last })
  }

  return [...rows.values()].sort((a, b) => b.last.time - a.last.time)
}

export function addSkipped(list: readonly SkippedFile[], entry: SkippedFile): SkippedFile[] {
  return [...list.filter(one => one.path !== entry.path), entry].slice(-MAX_SKIPPED)
}

export type Plan = { action: 'restore' | 'delete'; snapshot: SnapshotMeta } | { refuse: string; isForceable: boolean }

// What undoing `top` does given the file's current hash (null: the file is absent now).
export function plan(top: SnapshotMeta | undefined, currentHash: string | null, force: boolean): Plan {
  if (top === undefined) return { refuse: 'no snapshot to undo', isForceable: false }
  const isChanged = currentHash !== top.afterHash
  if (!top.existed) {
    return isChanged
      ? { refuse: 'the file did not exist before and has changed since Claude wrote it: it is not deleted', isForceable: false }
      : { action: 'delete', snapshot: top }
  }
  if (isChanged && !force) return { refuse: 'the file has changed since Claude last edited it', isForceable: true }

  return { action: 'restore', snapshot: top }
}

export type UndoArgs =
  | { kind: 'pane' }
  | { kind: 'close' }
  | { kind: 'list' }
  | { kind: 'clear' }
  | { kind: 'file'; path: string; confirm: boolean; force: boolean }

// `/undo`, `/undo list|clear|close`, `/undo <path> [confirm] [force]` (the flags read off the end, in any order).
export function parseArgs(raw: string): UndoArgs {
  const text = raw.trim()
  if (text === '') return { kind: 'pane' }
  if (text === 'list' || text === 'clear' || text === 'close') return { kind: text }
  let rest = text
  let confirm = false
  let force = false
  for (;;) {
    const flag = /\s+(confirm|force)$/.exec(rest)
    if (flag === null || (flag[1] === 'confirm' ? confirm : force)) break
    if (flag[1] === 'confirm') confirm = true
    else force = true
    rest = rest.slice(0, flag.index)
  }

  return { kind: 'file', path: unquote(rest), confirm, force }
}

const unquote = (text: string) => (/^(['"]).*\1$/.test(text) ? text.slice(1, -1) : text)

export function age(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`

  return `${Math.floor(s / 86_400)}d ago`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function rowLabel(row: FileRow, cwd: string, now: number): string {
  return `${displayPath(row.path, cwd)} · ${plural(row.count, 'snapshot')} · last ${row.last.tool} ${age(now - row.last.time)}`
}

// What an undo will do, said before it is confirmed.
export function preview(p: Plan, path: string, cwd: string, now: number, left: number): string {
  const shown = displayPath(path, cwd)
  if ('refuse' in p) return `Cannot undo ${shown}: ${p.refuse}.`
  const when = `${p.snapshot.tool} ${age(now - p.snapshot.time)}`

  return p.action === 'delete'
    ? `Undo will delete ${shown}: it did not exist before ${when}.`
    : `Undo will restore ${shown} to its content before ${when} (${plural(left, 'snapshot')} left after).`
}

export function done(p: Plan, path: string, cwd: string): string {
  const shown = displayPath(path, cwd)
  if ('refuse' in p) return `Cannot undo ${shown}: ${p.refuse}.`

  return p.action === 'delete' ? `Undo: deleted ${shown}` : `Undo: restored ${shown} (before ${p.snapshot.tool})`
}

export function listText(index: readonly SnapshotMeta[], skipped: readonly SkippedFile[], cwd: string, now: number): string {
  const rows = fileRows(index)
  const lines = rows.length === 0 ? ['No snapshots in this session.'] : [`${plural(rows.length, 'file')}, ${plural(index.length, 'snapshot')}, ${formatBytes(index.reduce((s, one) => s + one.bytes, 0))}:`]
  for (const row of rows) lines.push(`  ${rowLabel(row, cwd, now)}`)
  if (skipped.length > 0) {
    lines.push('Not snapshotted:')
    for (const one of skipped) lines.push(`  ${displayPath(one.path, cwd)}: ${one.reason}`)
  }

  return lines.join('\n')
}
