export type Commit = { sha: string; subject: string }

export type PullRequest = { action: 'created' | 'merged'; number?: number; url?: string }

export type CheckTally = { kind: string; pass: number; fail: number }

export type RecapLog = {
  files: string[]
  commits: Commit[]
  prs: PullRequest[]
  checks: CheckTally[]
}

declare module 'claude-code' {
  interface PluginState {
    'session-recap': { log: RecapLog }
  }
}
