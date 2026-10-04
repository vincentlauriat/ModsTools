export type AgentRow = {
  id: string
  label: string
  status: 'running' | 'done' | 'failed'
  startedAt: number
  endedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-tracker': { rows: AgentRow[] }
  }
}
