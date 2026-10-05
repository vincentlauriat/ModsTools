export type LastTurn = { failed: number; total: number; ms: number; errored: boolean; at: number }

declare module 'claude-code' {
  interface PluginState {
    'mood-band': { last: LastTurn | null }
  }
}
