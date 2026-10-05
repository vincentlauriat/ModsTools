export type Pending = { stale: string[] }

declare module 'claude-code' {
  interface PluginState {
    'je-coupe': { pending: Pending | null }
  }
}
