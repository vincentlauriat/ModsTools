export type Language = string

declare module 'claude-code' {
  interface PluginState {
    'build-gate': { missing: Language[] }
  }
}
