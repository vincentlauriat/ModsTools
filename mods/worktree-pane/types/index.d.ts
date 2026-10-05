export type DerivedFolder = { name: string; path: string; kb: number }

export type WorktreeRow = {
  path: string
  branch: string | null
  main: boolean
  bare: boolean
  locked: boolean
  prunable: boolean
  missing: boolean
  dirty: number
  derived: DerivedFolder[]
}

declare module 'claude-code' {
  interface PluginState {
    'worktree-pane': {
      rows: WorktreeRow[]
      error: string | null
      confirm: string | null
      notice: string | null
    }
  }
}
