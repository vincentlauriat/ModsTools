export type Simulator = { udid: string; name: string; runtime: string }

declare module 'claude-code' {
  interface PluginState {
    'simulator-pane': {
      rows: Simulator[]
      error: string | null
      confirm: string | null
      notice: string | null
    }
  }
}
