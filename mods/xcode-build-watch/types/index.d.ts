export type BuildReport = {
  project: string
  isOk: boolean
  seconds: number
  errors: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'xcode-build-watch': { last: BuildReport | null }
  }
}
