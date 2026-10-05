export type TestRecord = { fails: number; passes: number; failedAtEdit: number | null; flaky: boolean; lastSeen: number }
export type FlakyState = { edits: number; tests: Record<string, TestRecord> }

declare module 'claude-code' {
  interface PluginState {
    'flaky-detector': { history: FlakyState }
  }
}
