export type Pending = { prompt: string; tools: number; files: string[] }

declare module 'claude-code' {
  interface PluginState {
    'session-journal': { pending: Pending }
  }
}
