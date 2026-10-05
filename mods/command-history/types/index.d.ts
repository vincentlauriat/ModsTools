export type HistoryEntry = { command: string; status: string; ms: number }

declare module 'claude-code' {
  interface PluginState {
    'command-history': { entries: HistoryEntry[] }
  }
}
