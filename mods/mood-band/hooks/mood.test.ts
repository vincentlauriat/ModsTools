import { expect, test } from 'claude-code/testing'

import { pickMood } from './mood'

const base = { failed: 0, total: 3, ms: 10_000, errored: false, idleMs: 0 }

test('all calls succeeded: happy', () => {
  expect(pickMood(base).kind).toBe('happy')
  expect(pickMood({ ...base, total: 0 }).kind).toBe('happy')
})

test('a long turn is focused from 2 minutes', () => {
  expect(pickMood({ ...base, ms: 119_999 }).kind).toBe('happy')
  expect(pickMood({ ...base, ms: 120_000 }).kind).toBe('focused')
})

test('some failures worry, a majority is sad, half is still worried', () => {
  expect(pickMood({ ...base, failed: 1 }).kind).toBe('worried')
  expect(pickMood({ ...base, failed: 2, total: 4 }).kind).toBe('worried')
  expect(pickMood({ ...base, failed: 2 }).kind).toBe('sad')
})

test('an errored or aborted turn is sad even with no failed call', () => {
  expect(pickMood({ ...base, errored: true }).kind).toBe('sad')
})

test('failures outrank a long turn; sleep outranks everything', () => {
  expect(pickMood({ ...base, ms: 300_000, failed: 1 }).kind).toBe('worried')
  expect(pickMood({ ...base, failed: 3, idleMs: 30 * 60_000 }).kind).toBe('sleepy')
  expect(pickMood({ ...base, idleMs: 30 * 60_000 - 1 }).kind).toBe('happy')
})

test('faces and captions match the spec', () => {
  expect(pickMood(base)).toEqual({ kind: 'happy', face: '(^‿^)', caption: 'Tout roule' })
  expect(pickMood({ ...base, failed: 1 }).face).toBe('(•_•;)')
})
