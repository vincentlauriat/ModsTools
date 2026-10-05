export type PathFenceSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'path-fence': { isOff: PathFenceSwitch }
  }
}
