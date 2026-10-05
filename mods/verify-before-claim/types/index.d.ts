export type LastTurn = { codeChanged: boolean; checks: number; claim: string | null }

declare module 'claude-code' {
  interface PluginState {
    'verify-before-claim': { isWarning: boolean; last: LastTurn | null }
  }
}
