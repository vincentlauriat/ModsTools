export type ShieldSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'secret-shield': { isOff: ShieldSwitch }
  }
}
