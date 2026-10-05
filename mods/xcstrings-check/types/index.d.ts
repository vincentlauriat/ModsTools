export type LanguageReport = {
  language: string
  missing: string[]
  new: string[]
  review: string[]
}

export type CatalogReport = {
  path: string
  shown: string
  root: string
  sourceLanguage: string | null
  total: number
  languages: LanguageReport[]
  stale: string[]
  unreadable?: string
}

export type CatalogReports = Record<string, CatalogReport>

declare module 'claude-code' {
  interface PluginState {
    'xcstrings-check': { reports: CatalogReports; projects: string[] }
  }
}
