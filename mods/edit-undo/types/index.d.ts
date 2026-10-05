// One snapshot of a file taken before a main-agent Edit/Write/NotebookEdit; its content is kept apart, in `before`.
export type SnapshotMeta = {
  id: string
  path: string
  time: number
  tool: string
  existed: boolean // false: the file did not exist before the tool call
  bytes: number // UTF-8 size of the content before
  afterHash: string | null // SHA-256 of the content the tool left; null when the file was absent after
}

export type SkippedFile = { path: string; reason: string; time: number }

// An armed two-step undo: which action on which file, and the snapshot its preview described.
export type Armed = { key: string; snapshot: string }

declare module 'claude-code' {
  interface PluginState {
    'edit-undo': {
      index: SnapshotMeta[]
      before: StateFamily<string>
      skipped: SkippedFile[]
      confirm: Armed | null
      forceable: string | null
      armed: Armed | null
      notice: string | null
    }
  }
}
