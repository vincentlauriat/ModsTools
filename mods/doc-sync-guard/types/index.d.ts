export type MissingDocs = string[]

declare module 'claude-code' {
  interface PluginState {
    'doc-sync-guard': { missing: MissingDocs }
  }
}
