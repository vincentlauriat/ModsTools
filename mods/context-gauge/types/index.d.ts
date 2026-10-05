export type Fill = number | null

declare module 'claude-code' {
  interface PluginState {
    'context-gauge': { percent: Fill }
  }
}
