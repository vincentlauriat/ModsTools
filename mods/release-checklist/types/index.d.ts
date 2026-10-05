export type CheckState = 'ok' | 'fail' | 'skip'
export type Check = { label: string; state: CheckState; detail: string }
export type Report = { version: string; checks: Check[] }

declare module 'claude-code' {
  interface PluginState {
    'release-checklist': { report: Report | null }
  }
}
