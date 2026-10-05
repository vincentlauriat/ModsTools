export type Orphan = { name: string; path: string; workspace: string; kb: number }

export const DERIVED_SUBPATH = 'Library/Developer/Xcode/DerivedData'

// `plutil -extract WorkspacePath raw -o -` prints the bare path; anything else is not one.
export function parseWorkspacePath(stdout: string): string | null {
  const path = stdout.trim()

  return path.startsWith('/') && !path.includes('\n') && !path.includes('\0') ? path : null
}

// Only a path that is gone can be judged: a relative one is unreadable, and a path on /Volumes may just be unmounted.
export const isJudgeable = (workspace: string) => workspace.startsWith('/') && !workspace.startsWith('/Volumes/')

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

export function formatKb(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)} GB`
  if (kb >= 1024) return `${Math.round(kb / 1024)} MB`

  return `${Math.round(kb)} KB`
}

export const totalKb = (orphans: Orphan[]) => orphans.reduce((sum, orphan) => sum + orphan.kb, 0)

export const statusLine = (orphans: Orphan[]): string | undefined =>
  orphans.length === 0 ? undefined : `DerivedData: ${orphans.length} orphan${orphans.length === 1 ? '' : 's'} · ${formatKb(totalKb(orphans))}`

export function report(orphans: Orphan[]): string {
  if (orphans.length === 0) return 'No orphan DerivedData folders.'
  const lines = [...orphans].sort((a, b) => b.kb - a.kb).map(o => `${formatKb(o.kb).padStart(8)}  ${o.name}  <- ${o.workspace}`)

  return [`${statusLine(orphans)}`, ...lines, '', 'Run /deriveddata-janitor clean to delete them.'].join('\n')
}

// `du -sk` prints "<kb>\t<path>"; 0 when unreadable.
export function parseDuKb(stdout: string): number {
  const kb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '', 10)

  return Number.isFinite(kb) && kb >= 0 ? kb : 0
}
