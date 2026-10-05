export const DEFAULT_BRANCHES = ['main', 'master']
export const CACHE_MS = 30_000

// "main, develop" -> Set; an empty or missing option means the defaults.
export function parseBranches(raw: unknown): Set<string> {
  const names = typeof raw === 'string' ? raw.split(',').map(s => s.trim()).filter(Boolean) : []

  return new Set(names.length > 0 ? names : DEFAULT_BRANCHES)
}

export const isProtected = (branch: string, branches: Set<string>) => branches.has(branch)

export const isFresh = (at: number, now: number) => now - at < CACHE_MS

// The file a file-editing tool call targets, or null.
export function targetPath(input: unknown): string | null {
  const i = (input ?? {}) as { file_path?: unknown; notebook_path?: unknown }
  const path = typeof i.file_path === 'string' ? i.file_path : i.notebook_path

  return typeof path === 'string' && path !== '' ? path : null
}

export const absolute = (path: string, cwd: string) => (path.startsWith('/') ? path : `${cwd.replace(/\/$/, '')}/${path}`)

export const parentDir = (path: string): string | null => {
  const cut = path.lastIndexOf('/')

  return cut > 0 ? path.slice(0, cut) : cut === 0 && path.length > 1 ? '/' : null
}
