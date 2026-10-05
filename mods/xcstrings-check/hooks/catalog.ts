// Pure logic of xcstrings-check: a String Catalog's text read into what is pending per
// language, and the texts drawn from it. No `$` here: the hooks find and read the files.

import type { CatalogReport, LanguageReport } from '../types'

export const CATALOG_SUFFIX = '.xcstrings'

// Below this depth, the walk inside a variation or substitution stops.
const MAX_DEPTH = 8

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

/** Comma-separated language codes, trimmed, empty ones and duplicates dropped. */
export function parseLanguages(text: unknown): string[] {
  if (typeof text !== 'string') return []

  return [...new Set(text.split(',').map(one => one.trim()).filter(Boolean))]
}

// Every stringUnit's state in a localization: its own, and those nested in
// `variations` (plural, device, width…, nested in turn) and `substitutions`.
function unitStates(node: unknown, depth = 0): string[] {
  const one = record(node)
  if (one === null || depth > MAX_DEPTH) return []
  const states: string[] = []
  const unit = record(one.stringUnit)
  if (unit !== null) states.push(typeof unit.state === 'string' ? unit.state : 'translated')
  for (const kind of Object.values(record(one.variations) ?? {})) {
    for (const variant of Object.values(record(kind) ?? {})) states.push(...unitStates(variant, depth + 1))
  }
  for (const substitution of Object.values(record(one.substitutions) ?? {})) states.push(...unitStates(substitution, depth + 1))

  return states
}

type Analysis = Pick<CatalogReport, 'sourceLanguage' | 'total' | 'languages' | 'stale' | 'unreadable'>

/**
 * What a catalog's text leaves to do: per language other than the source one (those in
 * the catalog plus `expected`), the keys with no translation, in state `new`, or
 * `needs_review`; and the keys whose extractionState is `stale`. Keys marked
 * `shouldTranslate: false` are left out, and stale keys count only as stale.
 */
export function analyze(text: string, expected: readonly string[] = []): Analysis {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { sourceLanguage: null, total: 0, languages: [], stale: [], unreadable: 'not valid JSON' }
  }
  const root = record(json)
  const strings = record(root?.strings)
  if (root === null || strings === null) return { sourceLanguage: null, total: 0, languages: [], stale: [], unreadable: 'not a String Catalog (no "strings")' }
  const source = typeof root.sourceLanguage === 'string' ? root.sourceLanguage : null

  const entries = Object.entries(strings).flatMap(([key, value]) => {
    const entry = record(value)
    return entry === null || entry.shouldTranslate === false ? [] : [{ key, entry }]
  })
  const languages = new Set(expected)
  for (const { entry } of entries) for (const language of Object.keys(record(entry.localizations) ?? {})) languages.add(language)
  if (source !== null) languages.delete(source)

  const stale = entries.filter(({ entry }) => entry.extractionState === 'stale').map(({ key }) => key)
  const live = entries.filter(({ entry }) => entry.extractionState !== 'stale')
  const reports: LanguageReport[] = [...languages].sort().map(language => {
    const report: LanguageReport = { language, missing: [], new: [], review: [] }
    for (const { key, entry } of live) {
      const states = unitStates(record(entry.localizations)?.[language])
      if (states.length === 0) report.missing.push(key)
      else if (states.includes('new')) report.new.push(key)
      else if (states.includes('needs_review')) report.review.push(key)
    }
    return report
  })

  return { sourceLanguage: source, total: entries.length, languages: reports, stale }
}

export const pendingCount = (one: LanguageReport) => one.missing.length + one.new.length + one.review.length

/** `3 missing · 1 new · 1 review`, zero parts left out; empty when complete. */
export function counts(one: LanguageReport): string {
  return [
    one.missing.length > 0 ? `${one.missing.length} missing` : '',
    one.new.length > 0 ? `${one.new.length} new` : '',
    one.review.length > 0 ? `${one.review.length} review` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** All catalogs summed per language. */
export function byLanguage(reports: readonly CatalogReport[]): LanguageReport[] {
  const sum = new Map<string, LanguageReport>()
  for (const report of reports) {
    for (const one of report.languages) {
      const into = sum.get(one.language) ?? { language: one.language, missing: [], new: [], review: [] }
      into.missing.push(...one.missing)
      into.new.push(...one.new)
      into.review.push(...one.review)
      sum.set(one.language, into)
    }
  }

  return [...sum.values()].sort((a, b) => a.language.localeCompare(b.language))
}

/** `🌐 fr: 3 missing · 1 review, de: 2 missing · 1 stale`, or undefined when nothing is pending. */
export function statusText(reports: readonly CatalogReport[]): string | undefined {
  const languages = byLanguage(reports)
    .filter(one => pendingCount(one) > 0)
    .map(one => `${one.language}: ${counts(one)}`)
  const stale = reports.reduce((sum, one) => sum + one.stale.length, 0)
  const unreadable = reports.filter(one => one.unreadable !== undefined).length
  const tail = [stale > 0 ? `${stale} stale` : '', unreadable > 0 ? `${unreadable} unreadable` : ''].filter(Boolean)
  if (languages.length === 0 && tail.length === 0) return undefined
  const head = languages.join(', ')

  return `🌐 ${[head, ...tail].filter(Boolean).join(' · ')}`
}

export const MAX_KEYS = 8
const MAX_KEY_LENGTH = 40

const clip = (key: string) => (key.length > MAX_KEY_LENGTH ? `${key.slice(0, MAX_KEY_LENGTH - 1)}…` : key)

/** `missing (12): a, b, …  +4 more`: a label, the count and the first keys, each clipped. */
export function keyList(label: string, keys: readonly string[]): string {
  const first = keys.slice(0, MAX_KEYS).map(key => JSON.stringify(clip(key)))
  const more = keys.length > MAX_KEYS ? ` +${keys.length - MAX_KEYS} more` : ''

  return `${label} (${keys.length}): ${first.join(', ')}${more}`
}

/** The pane's lines for one catalog, with how deep each is indented. */
export function catalogLines(report: CatalogReport): { text: string; depth: number; tone: 'title' | 'ok' | 'pending' | 'dim' }[] {
  if (report.unreadable !== undefined) return [{ text: `${report.shown}: unreadable (${report.unreadable})`, depth: 0, tone: 'pending' }]
  const lines: ReturnType<typeof catalogLines> = [
    { text: `${report.shown} — ${report.total} keys, source ${report.sourceLanguage ?? '?'}`, depth: 0, tone: 'title' },
  ]
  if (report.languages.length === 0) lines.push({ text: 'no language besides the source one', depth: 1, tone: 'dim' })
  for (const one of report.languages) {
    if (pendingCount(one) === 0) {
      lines.push({ text: `${one.language} ✓`, depth: 1, tone: 'ok' })
      continue
    }
    lines.push({ text: `${one.language}: ${counts(one)}`, depth: 1, tone: 'pending' })
    if (one.missing.length > 0) lines.push({ text: keyList('missing', one.missing), depth: 2, tone: 'dim' })
    if (one.new.length > 0) lines.push({ text: keyList('new', one.new), depth: 2, tone: 'dim' })
    if (one.review.length > 0) lines.push({ text: keyList('needs review', one.review), depth: 2, tone: 'dim' })
  }
  if (report.stale.length > 0) lines.push({ text: keyList('stale', report.stale), depth: 1, tone: 'pending' })

  return lines
}

// Folders never walked when looking for catalogs.
const SKIPPED = new Set(['node_modules', 'build', 'Build', 'DerivedData', 'Pods', 'Carthage', 'release', 'vendor'])
const SKIPPED_SUFFIXES = ['.xcodeproj', '.xcworkspace', '.xcassets', '.app', '.framework', '.xcframework', '.lproj']

export const isWalked = (name: string) => !name.startsWith('.') && !SKIPPED.has(name) && !SKIPPED_SUFFIXES.some(suffix => name.endsWith(suffix))

export const isCatalog = (path: string) => path.endsWith(CATALOG_SUFFIX)

// Files and folders that mark a project's root folder.
export const isProjectMarker = (name: string) =>
  name === '.git' || name === 'project.yml' || name === 'Package.swift' || name.endsWith('.xcodeproj') || name.endsWith('.xcworkspace')

export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export function dirName(path: string): string {
  const cut = path.lastIndexOf('/')

  return cut <= 0 ? '/' : path.slice(0, cut)
}

/** The folder and every folder above it, closest first, ending at `/`. */
export function ancestors(dir: string): string[] {
  const list = [dir]
  for (let current = dir; current !== '/'; ) {
    current = dirName(current)
    list.push(current)
  }

  return list
}

export const join = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`)

/** `path` relative to `base` when inside it, else unchanged. */
export const shown = (path: string, base: string) => (path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path)
