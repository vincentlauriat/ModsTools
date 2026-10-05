export type LinterName = 'swiftlint' | 'eslint' | 'ruff' | 'shellcheck'

export type Severity = 'error' | 'warning'

export type Issue = {
  line: number
  column: number
  rule: string
  message: string
  severity: Severity
}

export type FileResult = {
  path: string
  shown: string
  linter: LinterName
  errors: number
  warnings: number
  issues: Issue[]
  failure?: string
}

export type LintResults = Record<string, FileResult>

declare module 'claude-code' {
  interface PluginState {
    'lint-watch': { results: LintResults; edited: string[]; summary: string | null }
  }
}
