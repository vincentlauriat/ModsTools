export type GuardSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'main-guard': { isOff: GuardSwitch }
  }
}
