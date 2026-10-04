export type Focus = { endsAt: number | null; now: number; isDone: boolean }

declare module 'claude-code' {
  interface PluginState {
    'focus-mode': { focus: Focus }
  }
}
