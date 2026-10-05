export type AdvisorState = {
  /** True while a crossing of the threshold would toast. */
  armed: boolean
  /** Paths edited by the main agent, oldest first. */
  files: string[]
  /** First line of the last prompt the user typed. */
  goal: string
}

declare module 'claude-code' {
  interface PluginState {
    'compact-advisor': { track: AdvisorState }
  }
}
