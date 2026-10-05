export type EnvProtectSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'env-protect': { isOff: EnvProtectSwitch }
  }
}
