import { expect, test } from 'claude-code/testing'

import type { SnapshotMeta } from '../types'
import { addSkipped, age, displayPath, evictions, fileRows, isLossy, listText, parseArgs, plan, preview, resolvePath, stackOf, utf8Bytes } from './snapshots'

const snap = (id: string, path: string, time: number, bytes = 10, extra: Partial<SnapshotMeta> = {}): SnapshotMeta => ({
  id,
  path,
  time,
  tool: 'Edit',
  existed: true,
  bytes,
  afterHash: `h-${id}`,
  ...extra,
})

test('resolvePath joins relative paths under the session folder and folds . and ..', () => {
  expect(resolvePath('src/a.ts', '/dev/app')).toBe('/dev/app/src/a.ts')
  expect(resolvePath('./src/../b.ts', '/dev/app/')).toBe('/dev/app/b.ts')
  expect(resolvePath('/dev/other//c.ts', '/dev/app')).toBe('/dev/other/c.ts')
})

test('displayPath shortens paths inside the session folder only', () => {
  expect(displayPath('/dev/app/src/a.ts', '/dev/app')).toBe('src/a.ts')
  expect(displayPath('/dev/application/a.ts', '/dev/app')).toBe('/dev/application/a.ts')
})

test('evictions keep at most 20 snapshots per file, dropping the oldest', () => {
  const list = Array.from({ length: 22 }, (_, i) => snap(`a${i}`, '/a', i))
  list.push(snap('b0', '/b', 0))
  expect(evictions(list)).toEqual(['a0', 'a1'])
})

test('evictions drop the oldest snapshots across files once the total is over the byte limit', () => {
  const list = [snap('old', '/a', 1, 30), snap('mid', '/b', 2, 30), snap('new', '/a', 3, 30)]
  expect(evictions(list, { perFile: 20, totalBytes: 60, count: 100 })).toEqual(['old'])
  expect(evictions(list, { perFile: 20, totalBytes: 30, count: 100 })).toEqual(['old', 'mid'])
  expect(evictions(list, { perFile: 20, totalBytes: 1000, count: 2 })).toEqual(['old'])
  expect(evictions(list, { perFile: 20, totalBytes: 90, count: 3 })).toEqual([])
})

test('stackOf orders a file’s snapshots oldest first; fileRows lists files newest first', () => {
  const list = [snap('x2', '/x', 5), snap('y1', '/y', 3), snap('x1', '/x', 1)]
  expect(stackOf(list, '/x').map(one => one.id)).toEqual(['x1', 'x2'])
  expect(fileRows(list).map(row => [row.path, row.count, row.last.id])).toEqual([
    ['/x', 2, 'x2'],
    ['/y', 1, 'y1'],
  ])
})

test('plan restores when the file is as Claude left it, refuses a changed file unless forced', () => {
  const top = snap('s', '/a', 1)
  expect(plan(top, 'h-s', false)).toEqual({ action: 'restore', snapshot: top })
  expect(plan(top, 'other', false)).toEqual({ refuse: 'the file has changed since Claude last edited it', isForceable: true })
  expect(plan(top, null, false)).toEqual({ refuse: 'the file has changed since Claude last edited it', isForceable: true })
  expect(plan(top, 'other', true)).toEqual({ action: 'restore', snapshot: top })
  expect(plan(undefined, 'x', true)).toEqual({ refuse: 'no snapshot to undo', isForceable: false })
})

test('plan deletes a created file only when unchanged; force does not override that', () => {
  const created = snap('c', '/new', 1, 0, { existed: false })
  expect(plan(created, 'h-c', false)).toEqual({ action: 'delete', snapshot: created })
  const changed = plan(created, 'other', true)
  expect('refuse' in changed && changed.isForceable).toBe(false)
})

test('parseArgs reads the subcommands and the flags off the end of a path', () => {
  expect(parseArgs('')).toEqual({ kind: 'pane' })
  expect(parseArgs(' list ')).toEqual({ kind: 'list' })
  expect(parseArgs('clear')).toEqual({ kind: 'clear' })
  expect(parseArgs('src/a.ts')).toEqual({ kind: 'file', path: 'src/a.ts', confirm: false, force: false })
  expect(parseArgs('my file.ts confirm')).toEqual({ kind: 'file', path: 'my file.ts', confirm: true, force: false })
  expect(parseArgs('a.ts confirm force')).toEqual({ kind: 'file', path: 'a.ts', confirm: true, force: true })
  expect(parseArgs('a.ts force confirm')).toEqual({ kind: 'file', path: 'a.ts', confirm: true, force: true })
  expect(parseArgs('"x y.ts" confirm')).toEqual({ kind: 'file', path: 'x y.ts', confirm: true, force: false })
  expect(parseArgs('confirm')).toEqual({ kind: 'file', path: 'confirm', confirm: false, force: false })
})

test('preview says what will happen', () => {
  const top = snap('s', '/dev/app/a.ts', 0, 10, { tool: 'Write' })
  expect(preview({ action: 'restore', snapshot: top }, top.path, '/dev/app', 120_000, 2)).toBe(
    'Undo will restore a.ts to its content before Write 2m ago (2 snapshots left after).',
  )
  expect(preview({ action: 'delete', snapshot: top }, top.path, '/dev/app', 5_000, 0)).toBe('Undo will delete a.ts: it did not exist before Write 5s ago.')
  expect(preview({ refuse: 'nope', isForceable: false }, top.path, '/dev/app', 0, 0)).toBe('Cannot undo a.ts: nope.')
})

test('listText lists files and the files that were not snapshotted', () => {
  const text = listText([snap('a', '/dev/app/a.ts', 0, 2048)], [{ path: '/dev/app/big.json', reason: 'over 1 MB (2.0 MB), not snapshotted', time: 0 }], '/dev/app', 3_600_000)
  expect(text).toBe(['1 file, 1 snapshot, 2.0 KB:', '  a.ts · 1 snapshot · last Edit 1h ago', 'Not snapshotted:', '  big.json: over 1 MB (2.0 MB), not snapshotted'].join('\n'))
  expect(listText([], [], '/dev/app', 0)).toBe('No snapshots in this session.')
})

test('helpers: bytes, lossy text, ages, skipped list', () => {
  expect(utf8Bytes('é')).toBe(2)
  expect(isLossy('a�b')).toBe(true)
  expect(isLossy('plain')).toBe(false)
  expect(age(90_000_000)).toBe('1d ago')
  expect(addSkipped([{ path: '/a', reason: 'r', time: 0 }], { path: '/a', reason: 's', time: 1 })).toEqual([{ path: '/a', reason: 's', time: 1 }])
})
