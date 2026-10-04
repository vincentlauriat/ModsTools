export type RmGuardSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'rm-guard': { isOff: RmGuardSwitch }
  }
}
