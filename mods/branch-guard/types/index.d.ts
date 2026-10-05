export type BranchGuardSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'branch-guard': { isOff: BranchGuardSwitch }
  }
}
