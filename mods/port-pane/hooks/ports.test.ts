import { expect, test } from 'claude-code/testing'

import { canStop, decode, isNew, newPortCount, parseCwds, parseListeners, portOf, rowLabel, statusText, toRows } from './ports'

const LSOF = [
  'p501',
  'crapportd',
  'Ldev',
  'f16',
  'n*:55852',
  'f17',
  'n*:55852',
  'p4242',
  'cnode',
  'Ldev',
  'f20',
  'n127.0.0.1:5173',
  'f21',
  'n[::1]:5173',
  'f22',
  'n*:24678',
  'p4300',
  'cMy\\x20Server',
  'Ldev',
  'f5',
  'n127.0.0.1:8080',
  'p77',
  'cpostgres',
  'Lother',
  'f7',
  'n127.0.0.1:5432',
  '',
].join('\n')

test('parseListeners groups -F pcnL output by pid with unique, sorted ports', () => {
  expect(parseListeners(LSOF)).toEqual([
    { pid: 77, command: 'postgres', login: 'other', ports: [5432] },
    { pid: 501, command: 'rapportd', login: 'dev', ports: [55852] },
    { pid: 4242, command: 'node', login: 'dev', ports: [5173, 24678] },
    { pid: 4300, command: 'My Server', login: 'dev', ports: [8080] },
  ])
  expect(parseListeners('')).toEqual([])
  expect(parseListeners('garbage\nnot fields')).toEqual([])
})

test('portOf and decode read lsof fields', () => {
  expect(portOf('*:3000')).toBe(3000)
  expect(portOf('[::1]:5177')).toBe(5177)
  expect(portOf('127.0.0.1:8080')).toBe(8080)
  expect(portOf('localhost')).toBeNull()
  expect(decode('a\\x20b\\\\c')).toBe('a b\\c')
})

test('parseCwds maps each pid to its cwd', () => {
  const cwds = parseCwds('p4242\nfcwd\nn/Users/dev/app\np4300\nfcwd\nn/Users/dev/My\\x20Site\n')
  expect([...cwds]).toEqual([
    [4242, '/Users/dev/app'],
    [4300, '/Users/dev/My Site'],
  ])
})

test('a listener is new when one of its pid:port pairs was not in the baseline', () => {
  const baseline = ['4242:5173', '4300:8080']
  expect(isNew({ pid: 4242, ports: [5173] }, baseline)).toBe(false)
  expect(isNew({ pid: 4242, ports: [5173, 24678] }, baseline)).toBe(true)
  // A restarted server on an old port has a new pid: new.
  expect(isNew({ pid: 9999, ports: [8080] }, baseline)).toBe(true)
  const rows = toRows(parseListeners(LSOF), ['501:55852', '4300:8080'], new Map([[4242, '/Users/dev/app']]))
  expect(rows.map(row => [row.pid, row.isNew, row.cwd])).toEqual([
    [77, true, null],
    [4242, true, '/Users/dev/app'],
    [501, false, null],
    [4300, false, null],
  ])
  expect(newPortCount(rows, 'dev')).toBe(2)
  expect(statusText(2)).toBe('🔌 2 dev ports')
  expect(statusText(1)).toBe('🔌 1 dev port')
  expect(statusText(0)).toBeUndefined()
  expect(rowLabel(rows[1]!)).toBe('● node · pid 4242 · :5173 :24678')
})

test('canStop: hard refusals win over Allow stop; Allow stop lifts only the session rule (test bites)', () => {
  const row = { pid: 4242, command: 'node', login: 'dev', isNew: true }
  expect(canStop(row, 'dev', [])).toEqual({ ok: true })
  expect(canStop({ ...row, login: 'other' }, 'dev', [4242])).toEqual({ ok: false, reason: 'owned by another user', hard: true })
  expect(canStop(row, null, [4242])).toEqual({ ok: false, reason: 'owned by another user', hard: true })
  expect(canStop({ ...row, pid: 99 }, 'dev', [99])).toEqual({ ok: false, reason: 'system process', hard: true })
  expect(canStop({ ...row, command: 'ControlCenter' }, 'dev', [4242])).toEqual({ ok: false, reason: 'system or desktop app', hard: true })
  expect(canStop({ ...row, command: 'Spotify', isNew: false }, 'dev', [4242])).toEqual({ ok: false, reason: 'system or desktop app', hard: true })
  expect(canStop({ ...row, isNew: false }, 'dev', [])).toEqual({ ok: false, reason: 'listening before this session', hard: false })
  expect(canStop({ ...row, isNew: false }, 'dev', [4242])).toEqual({ ok: true })
})
