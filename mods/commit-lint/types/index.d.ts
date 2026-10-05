export type CommitLintSwitch = boolean

declare module 'claude-code' {
  interface PluginState {
    'commit-lint': { isOff: CommitLintSwitch }
  }
}
