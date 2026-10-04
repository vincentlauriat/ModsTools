export type DiffSnapshot = { error: string | null; stat: string[]; untracked: number }

declare module 'claude-code' {
  interface PluginState {
    'diff-preview': { snapshot: DiffSnapshot }
  }
}
