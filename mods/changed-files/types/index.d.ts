export type ChangedFile = { path: string; tool: string; edits: number }

declare module 'claude-code' {
  interface PluginState {
    'changed-files': { files: ChangedFile[] }
  }
}
