export type Turn = { ms: number; tools: number }

declare module 'claude-code' {
  interface PluginState {
    'turn-timer': { last: Turn | null; isHidden: boolean }
  }
}
