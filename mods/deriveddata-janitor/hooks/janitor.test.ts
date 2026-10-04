import { expect, test } from 'claude-code/testing'

import { formatKb, isCacheName, isJudgeable, isSafeTarget, parseDuKb, parseWorkspacePath, report, statusLine } from './janitor'

const ROOT = '/Users/v/Library/Developer/Xcode/DerivedData'

test('the safety check accepts only one plain folder directly under the root', async () => {
  expect(isSafeTarget(ROOT, `${ROOT}/App-abc123`)).toBe(true)
  expect(isSafeTarget(ROOT, `${ROOT}/Untitled Project-xyz`)).toBe(true)
})

test('the safety check refuses .., the root itself, deeper paths and paths outside', async () => {
  for (const bad of [
    `${ROOT}/..`,
    `${ROOT}/../Other`,
    `${ROOT}/.`,
    ROOT,
    `${ROOT}/`,
    `${ROOT}/App-abc/Build`,
    `${ROOT}-evil/App`,
    '/Users/v/Library/Developer/Xcode',
    '/Users/v/DevApps/App',
    '/',
    'DerivedData/App',
    `${ROOT}/App\0x`,
  ])
    expect(isSafeTarget(ROOT, bad)).toBe(false)
  expect(isSafeTarget('', '/App')).toBe(false)
  expect(isSafeTarget('relative', 'relative/App')).toBe(false)
})

test('workspace paths: only an absolute single-line path is taken', async () => {
  expect(parseWorkspacePath('/Users/v/App.xcodeproj\n')).toBe('/Users/v/App.xcodeproj')
  for (const bad of ['', 'App.xcodeproj', '/a\n/b', '\n']) expect(parseWorkspacePath(bad)).toBeNull()
})

test('unmounted volumes and relative paths are never judged gone', async () => {
  expect(isJudgeable('/Users/v/DevApps/App.xcodeproj')).toBe(true)
  expect(isJudgeable('/private/tmp/wt/App.xcodeproj')).toBe(true)
  expect(isJudgeable('/Volumes/External/App.xcodeproj')).toBe(false)
  expect(isJudgeable('App.xcodeproj')).toBe(false)
})

test('shared cache folders are never candidates', async () => {
  for (const name of ['ModuleCache.noindex', 'SymbolCache.noindex', 'SDKStatCaches.noindex', '.DS_Store']) expect(isCacheName(name)).toBe(true)
  expect(isCacheName('App-abc123')).toBe(false)
})

test('sizes and the status line', async () => {
  expect(formatKb(512)).toBe('512 KB')
  expect(formatKb(2048)).toBe('2 MB')
  expect(formatKb(3.2 * 1024 * 1024)).toBe('3.2 GB')
  expect(parseDuKb('1234\t/x/y\n')).toBe(1234)
  expect(parseDuKb('du: nope')).toBe(0)
  const o = (kb: number) => ({ name: 'n', path: '/p', workspace: '/w', kb })
  expect(statusLine([])).toBeUndefined()
  expect(statusLine([o(1024 * 1024), o(1024 * 1024)])).toBe('DerivedData: 2 orphans · 2.0 GB')
  expect(statusLine([o(1024)])).toBe('DerivedData: 1 orphan · 1 MB')
  expect(report([])).toBe('No orphan DerivedData folders.')
  expect(report([{ name: 'A-1', path: '/p', workspace: '/gone/A.xcodeproj', kb: 2048 }])).toContain('A-1  <- /gone/A.xcodeproj')
})
