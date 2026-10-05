export type Enabled = boolean

declare module 'claude-code' {
  interface PluginState {
    'done-sound': { isEnabled: Enabled }
  }
}
