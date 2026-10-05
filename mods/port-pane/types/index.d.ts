export type PortRow = {
  pid: number
  command: string
  login: string
  ports: number[]
  cwd: string | null
  // A port of this pid was first seen after the session started.
  isNew: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'port-pane': {
      rows: PortRow[]
      error: string | null
      // `stop:<pid>` or `force:<pid>` while waiting for the second press.
      confirm: string | null
      notice: string | null
      // `pid:port` keys listening when the session started; null until the first listing.
      baseline: string[] | null
      // Pids the person explicitly allowed to stop although they were listening before the session.
      allowed: number[]
      // Pids still alive 3 s after SIGTERM: Force stop is offered for them.
      stubborn: number[]
    }
  }
}
