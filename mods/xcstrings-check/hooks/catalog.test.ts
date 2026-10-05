import { expect, test } from 'claude-code/testing'

import { analyze, catalogLines, isWalked, keyList, parseLanguages, statusText } from './catalog'
import type { CatalogReport } from '../types'

const unit = (state: string, value = 'x') => ({ stringUnit: { state, value } })

// An invented catalog: source "en", with fr and de in it.
const CATALOG = JSON.stringify({
  sourceLanguage: 'en',
  version: '1.0',
  strings: {
    Done: { extractionState: 'manual', localizations: { en: unit('translated'), fr: unit('translated'), de: unit('translated') } },
    Hello: { localizations: { fr: unit('needs_review') } },
    Welcome: { localizations: { fr: unit('new'), de: unit('translated') } },
    Untouched: {},
    '%lld items': {
      localizations: {
        fr: { variations: { plural: { one: unit('translated'), other: unit('needs_review') } } },
        de: { variations: { device: { mac: { variations: { plural: { one: unit('translated'), other: unit('new') } } } } } },
      },
    },
    'Copied %@': {
      localizations: {
        fr: { stringUnit: { state: 'translated', value: '%#@n@' }, substitutions: { n: { argNum: 1, variations: { plural: { other: unit('translated') } } } } },
      },
    },
    Logo: { shouldTranslate: false },
    Removed: { extractionState: 'stale', localizations: { fr: unit('translated') } },
  },
})

test('per language: missing, new and needs_review keys; source language left out', () => {
  const report = analyze(CATALOG)
  expect(report.sourceLanguage).toBe('en')
  expect(report.total).toBe(7)
  expect(report.unreadable).toBeUndefined()
  expect(report.languages).toEqual([
    { language: 'de', missing: ['Hello', 'Untouched', 'Copied %@'], new: ['%lld items'], review: [] },
    { language: 'fr', missing: ['Untouched'], new: ['Welcome'], review: ['Hello', '%lld items'] },
  ])
})

test('stale entries are listed once and not counted as missing; shouldTranslate false is ignored', () => {
  const report = analyze(CATALOG)
  expect(report.stale).toEqual(['Removed'])
  const all = report.languages.flatMap(one => [...one.missing, ...one.new, ...one.review])
  expect(all.includes('Removed')).toBe(false)
  expect(all.includes('Logo')).toBe(false)
})

test('expected languages from userConfig are added, the source one never', () => {
  const report = analyze(CATALOG, ['it', 'en'])
  expect(report.languages.map(one => one.language)).toEqual(['de', 'fr', 'it'])
  expect(report.languages.find(one => one.language === 'it')?.missing.length).toBe(6)
  expect(parseLanguages(' fr, de ,,fr ')).toEqual(['fr', 'de'])
  expect(parseLanguages(undefined)).toEqual([])
})

test('a catalog with only its source language has nothing pending', () => {
  const report = analyze(JSON.stringify({ sourceLanguage: 'fr', strings: { Bonjour: { localizations: { fr: unit('translated') } } }, version: '1.0' }))
  expect(report.languages).toEqual([])
})

test('malformed JSON and other JSON are unreadable, never thrown', () => {
  expect(analyze('{"sourceLanguage":"en","strings":{').unreadable).toBe('not valid JSON')
  expect(analyze('[1,2]').unreadable).toBe('not a String Catalog (no "strings")')
  expect(analyze('{"sourceLanguage":"en"}').unreadable).toBe('not a String Catalog (no "strings")')
  expect(analyze('{"sourceLanguage":"en","strings":{"a":null,"b":"text","c":{"localizations":{"fr":{"variations":"odd"}}}}}').languages).toEqual([
    { language: 'fr', missing: ['c'], new: [], review: [] },
  ])
})

const report = (shown: string, extra: Partial<CatalogReport>): CatalogReport => ({
  path: `/p/${shown}`,
  shown,
  root: '/p',
  sourceLanguage: 'en',
  total: 3,
  languages: [],
  stale: [],
  ...extra,
})

test('status line sums catalogs per language, then stale and unreadable; undefined when complete', () => {
  const a = report('A.xcstrings', { languages: [{ language: 'fr', missing: ['a', 'b'], new: [], review: ['c'] }], stale: ['old'] })
  const b = report('B.xcstrings', {
    languages: [
      { language: 'fr', missing: ['d'], new: [], review: [] },
      { language: 'de', missing: [], new: ['e'], review: [] },
    ],
  })
  expect(statusText([a, b])).toBe('🌐 de: 1 new, fr: 3 missing · 1 review · 1 stale')
  expect(statusText([report('C.xcstrings', { unreadable: 'not valid JSON' })])).toBe('🌐 1 unreadable')
  expect(statusText([report('D.xcstrings', { languages: [{ language: 'fr', missing: [], new: [], review: [] }] })])).toBeUndefined()
  expect(statusText([])).toBeUndefined()
})

test('long key lists are cut with a count, long keys clipped', () => {
  const keys = Array.from({ length: 11 }, (_, i) => `k${i}`)
  expect(keyList('missing', keys)).toBe('missing (11): "k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7" +3 more')
  expect(keyList('stale', ['x'.repeat(50)])).toBe(`stale (1): "${'x'.repeat(39)}…"`)
})

test('pane lines: catalog, then each language, its key lists, and stale keys', () => {
  const lines = catalogLines(
    report('App/Localizable.xcstrings', {
      languages: [
        { language: 'de', missing: [], new: [], review: [] },
        { language: 'fr', missing: ['a'], new: [], review: ['b'] },
      ],
      stale: ['old'],
    }),
  ).map(line => `${line.depth}|${line.text}`)
  expect(lines).toEqual([
    '0|App/Localizable.xcstrings — 3 keys, source en',
    '1|de ✓',
    '1|fr: 1 missing · 1 review',
    '2|missing (1): "a"',
    '2|needs review (1): "b"',
    '1|stale (1): "old"',
  ])
  expect(catalogLines(report('Bad.xcstrings', { unreadable: 'not valid JSON' })).map(line => line.text)).toEqual(['Bad.xcstrings: unreadable (not valid JSON)'])
})

test('hidden, build and dependency folders are not walked', () => {
  expect(['Sources', 'App', 'Resources'].every(isWalked)).toBe(true)
  expect(['.git', '.build', 'node_modules', 'DerivedData', 'App.xcodeproj', 'Assets.xcassets', 'fr.lproj', 'Pods'].some(isWalked)).toBe(false)
})
