export type BriefText = string | null

declare module 'claude-code' {
  interface PluginState {
    'resume-brief': { text: BriefText }
  }
}
