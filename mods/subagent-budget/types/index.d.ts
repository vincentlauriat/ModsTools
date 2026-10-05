export type TurnCount = {
  /** Subagents started since the last prompt that began a turn. */
  count: number
  /** Whether this turn already toasted. */
  toasted: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'subagent-budget': { turn: TurnCount }
  }
}
