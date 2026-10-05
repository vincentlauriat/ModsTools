export type PendingFolders = string[]

declare module 'claude-code' {
  interface PluginState {
    'xcodegen-sync': { pending: PendingFolders }
  }
}
