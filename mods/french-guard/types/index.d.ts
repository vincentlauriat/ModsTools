export type GuardState = { isEnabled: boolean; last: string }

declare module 'claude-code' {
  interface PluginState {
    'french-guard': { guard: GuardState }
  }
}
