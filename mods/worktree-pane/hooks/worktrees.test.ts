import { expect, test } from 'claude-code/testing'

import type { WorktreeRow } from '../types'
import {
  derivedLabel,
  dirtyCount,
  firstLine,
  formatKb,
  isInside,
  isSafeTarget,
  ownerOf,
  parseDuKb,
  parsePorcelain,
  parseWorkspacePath,
  removedToast,
  rowLabel,
  shortPath,
} from './worktrees'

const PORCELAIN = [
  'worktree /dev/app',
  'HEAD bb7cc063b30af1a84716275b646fd30db47834b5',
  'branch refs/heads/main',
  '',
  'worktree /dev/app-wt1',
  'HEAD bb7cc063b30af1a84716275b646fd30db47834b5',
  'branch refs/heads/feat/one',
  '',
  'worktree /dev/app-wt10',
  'HEAD bb7cc063b30af1a84716275b646fd30db47834b5',
  'detached',
  'locked why',
  '',
  'worktree /dev/app-gone',
  'HEAD bb7cc063b30af1a84716275b646fd30db47834b5',
  'branch refs/heads/gone',
  'prunable le fichier gitdir pointe sur un endroit inexistant',
  '',
  '',
].join('\n')

const row = (over: Partial<WorktreeRow> = {}): WorktreeRow => ({
  path: '/dev/app-wt1',
  branch: 'feat/one',
  main: false,
  bare: false,
  locked: false,
  prunable: false,
  missing: false,
  dirty: 0,
  derived: [],
  ...over,
})

test('parsePorcelain reads branch, detached, locked and prunable (reason text ignored)', () => {
  expect(parsePorcelain(PORCELAIN)).toEqual([
    { path: '/dev/app', branch: 'main', bare: false, locked: false, prunable: false },
    { path: '/dev/app-wt1', branch: 'feat/one', bare: false, locked: false, prunable: false },
    { path: '/dev/app-wt10', branch: null, bare: false, locked: true, prunable: false },
    { path: '/dev/app-gone', branch: 'gone', bare: false, locked: false, prunable: true },
  ])
})

test('parsePorcelain handles a bare main and garbage', () => {
  expect(parsePorcelain('worktree /srv/r.git\nbare\n')).toEqual([{ path: '/srv/r.git', branch: null, bare: true, locked: false, prunable: false }])
  expect(parsePorcelain('')).toEqual([])
  expect(parsePorcelain('fatal: not a git repository\n')).toEqual([])
})

test('isInside has a trailing-slash guard: /a/wt1 does not match /a/wt10', () => {
  expect(isInside('/a/wt1/App.xcodeproj', '/a/wt1')).toBe(true)
  expect(isInside('/a/wt1', '/a/wt1/')).toBe(true)
  expect(isInside('/a/wt10/App.xcodeproj', '/a/wt1')).toBe(false)
  expect(isInside('/a/anything', '')).toBe(false)
})

test('ownerOf picks the deepest worktree containing the workspace', () => {
  const paths = ['/dev/app', '/dev/app/.wt/x', '/dev/app-wt1']
  expect(ownerOf('/dev/app/.wt/x/App.xcodeproj', paths)).toBe('/dev/app/.wt/x')
  expect(ownerOf('/dev/app/App.xcodeproj', paths)).toBe('/dev/app')
  expect(ownerOf('/dev/app-wt1/App.xcodeproj', paths)).toBe('/dev/app-wt1')
  expect(ownerOf('/dev/app-wt10/App.xcodeproj', paths)).toBeNull()
})

test('isSafeTarget accepts only one plain name directly under the root', () => {
  const root = '/Users/v/Library/Developer/Xcode/DerivedData'
  expect(isSafeTarget(root, `${root}/App-abc`)).toBe(true)
  expect(isSafeTarget(root, root)).toBe(false)
  expect(isSafeTarget(root, `${root}/`)).toBe(false)
  expect(isSafeTarget(root, `${root}/..`)).toBe(false)
  expect(isSafeTarget(root, `${root}/a/b`)).toBe(false)
  expect(isSafeTarget(root, `${root}-other/a`)).toBe(false)
  expect(isSafeTarget('', '/x')).toBe(false)
  expect(isSafeTarget('relative', 'relative/x')).toBe(false)
})

test('shortPath is relative inside main, ~ under HOME, else absolute', () => {
  expect(shortPath('/dev/app', '/dev/app', '/Users/v')).toBe('app')
  expect(shortPath('/dev/app/.wt/x', '/dev/app', '/Users/v')).toBe('app/.wt/x')
  expect(shortPath('/Users/v/tmp/wt', '/dev/app', '/Users/v')).toBe('~/tmp/wt')
  expect(shortPath('/private/tmp/wt', '/dev/app', '/Users/v')).toBe('/private/tmp/wt')
  expect(shortPath('/private/tmp/wt', '/dev/app', null)).toBe('/private/tmp/wt')
})

test('formatKb and parseDuKb', () => {
  expect(formatKb(512)).toBe('512 KB')
  expect(formatKb(2048)).toBe('2 MB')
  expect(formatKb(1048576)).toBe('1.0 GB')
  expect(parseDuKb('1024\t/x\n')).toBe(1024)
  expect(parseDuKb('du: nope')).toBe(0)
})

test('parseWorkspacePath and dirtyCount', () => {
  expect(parseWorkspacePath('/dev/App.xcodeproj\n')).toBe('/dev/App.xcodeproj')
  expect(parseWorkspacePath('relative/App.xcodeproj')).toBeNull()
  expect(parseWorkspacePath('')).toBeNull()
  expect(dirtyCount(' M a.ts\n?? b.ts\n')).toBe(2)
  expect(dirtyCount('')).toBe(0)
})

test('rowLabel and derivedLabel', () => {
  expect(rowLabel(row({ main: true, path: '/dev/app', branch: 'main' }), '/dev/app', null)).toBe('app · main · main')
  expect(rowLabel(row({ branch: null, dirty: 3, locked: true }), '/dev/app', null)).toBe('/dev/app-wt1 · detached · locked · 3 dirty')
  expect(rowLabel(row({ missing: true, prunable: true }), '/dev/app', null)).toBe('/dev/app-wt1 · feat/one · missing')
  expect(derivedLabel(row())).toBeNull()
  expect(derivedLabel(row({ derived: [{ name: 'A-1', path: '/r/A-1', kb: 1048576 }] }))).toBe('DerivedData: 1 folder · 1.0 GB')
})

test('removedToast and firstLine', () => {
  expect(removedToast('wt1', 2, 3145728)).toBe('Removed wt1 + 2 DerivedData (3.0 GB)')
  expect(firstLine('\nfatal: contains modified files\nuse --force')).toBe('fatal: contains modified files')
  expect(firstLine('')).toBe('git worktree remove failed')
})
