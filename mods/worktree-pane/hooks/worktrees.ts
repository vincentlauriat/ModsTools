import type { WorktreeRow } from '../types'

export const DERIVED_SUBPATH = 'Library/Developer/Xcode/DerivedData'
export const NOT_A_REPO = 'not a git repository'

export type Entry = { path: string; branch: string | null; bare: boolean; locked: boolean; prunable: boolean }

// `git worktree list --porcelain`: blocks separated by a blank line, first line `worktree <path>`, then
// `HEAD <sha>`, `branch refs/heads/<name>` | `detached` | `bare`, optional `locked [reason]` / `prunable [reason]`.
// Reasons are localised: only the keywords are read. The first block is the main worktree.
export function parsePorcelain(stdout: string): Entry[] {
  const entries: Entry[] = []
  for (const block of stdout.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter(line => line !== '')
    const first = lines[0]
    if (first === undefined || !first.startsWith('worktree /')) continue
    const keyword = (word: string) => lines.some(line => line === word || line.startsWith(`${word} `))
    const branch = lines.find(line => line.startsWith('branch '))

    entries.push({
      path: first.slice('worktree '.length),
      branch: branch === undefined ? null : branch.slice('branch '.length).replace(/^refs\/heads\//, ''),
      bare: keyword('bare'),
      locked: keyword('locked'),
      prunable: keyword('prunable'),
    })
  }

  return entries
}

// `plutil -extract WorkspacePath raw -o -` prints the bare path; anything else is not one.
export function parseWorkspacePath(stdout: string): string | null {
  const path = stdout.trim()

  return path.startsWith('/') && !path.includes('\n') && !path.includes('\0') ? path : null
}

// `du -sk` prints "<kb>\t<path>"; 0 when unreadable.
export function parseDuKb(stdout: string): number {
  const kb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '', 10)

  return Number.isFinite(kb) && kb >= 0 ? kb : 0
}

export const dirtyCount = (stdout: string) => stdout.split('\n').filter(line => line.trim() !== '').length

// A folder name never to touch: Xcode's shared caches (`*.noindex`) and hidden entries.
export const isCacheName = (name: string) => name.endsWith('.noindex') || name.startsWith('.')

// True only for `<root>/<one plain name>`: never the root, a deeper path, `..`, or a path outside the root.
export function isSafeTarget(root: string, path: string): boolean {
  if (root === '' || !root.startsWith('/') || path.includes('\0')) return false
  const prefix = root.endsWith('/') ? root : `${root}/`
  if (!path.startsWith(prefix)) return false
  const name = path.slice(prefix.length)

  return name !== '' && name !== '.' && name !== '..' && !name.includes('/')
}

// The trailing-slash guard keeps /a/wt1 from matching /a/wt10.
export function isInside(path: string, root: string): boolean {
  const base = root.replace(/\/+$/, '')

  return base !== '' && (path === base || path.startsWith(`${base}/`))
}

// The worktree a workspace belongs to: the deepest one containing it (a linked worktree can sit inside the main one).
export function ownerOf(workspace: string, worktrees: string[]): string | null {
  let best: string | null = null
  for (const path of worktrees) {
    if (isInside(workspace, path) && (best === null || path.length > best.length)) best = path
  }

  return best
}

export const baseName = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? path

// Relative to the main worktree when inside it, `~/…` under HOME, else as is.
export function shortPath(path: string, mainPath: string, home: string | null): string {
  if (path === mainPath) return baseName(path)
  if (isInside(path, mainPath)) return `${baseName(mainPath)}/${path.slice(mainPath.replace(/\/+$/, '').length + 1)}`
  if (home !== null && home !== '' && isInside(path, home) && path !== home) return `~/${path.slice(home.replace(/\/+$/, '').length + 1)}`

  return path
}

export function formatKb(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)} GB`
  if (kb >= 1024) return `${Math.round(kb / 1024)} MB`

  return `${Math.round(kb)} KB`
}

export const totalKb = (row: WorktreeRow) => row.derived.reduce((sum, folder) => sum + folder.kb, 0)

export function rowLabel(row: WorktreeRow, mainPath: string, home: string | null): string {
  const parts = [shortPath(row.path, mainPath, home), row.bare ? 'bare' : (row.branch ?? 'detached')]
  if (row.main) parts.push('main')
  if (row.missing) parts.push('missing')
  else if (row.prunable) parts.push('prunable')
  if (row.locked) parts.push('locked')
  if (row.dirty > 0) parts.push(`${row.dirty} dirty`)

  return parts.join(' · ')
}

export function derivedLabel(row: WorktreeRow): string | null {
  const n = row.derived.length

  return n === 0 ? null : `DerivedData: ${n} folder${n === 1 ? '' : 's'} · ${formatKb(totalKb(row))}`
}

export const removedToast = (name: string, count: number, kb: number) => `Removed ${name} + ${count} DerivedData (${formatKb(kb)})`

// First non-empty line of git's message, kept short for the pane.
export function firstLine(text: string): string {
  const line = text.split('\n').find(one => one.trim() !== '') ?? 'git worktree remove failed'

  return line.trim().slice(0, 200)
}
