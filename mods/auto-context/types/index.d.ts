export type ContextText = string | null

declare module 'claude-code' {
  interface PluginState {
    'auto-context': { text: ContextText }
  }
}
