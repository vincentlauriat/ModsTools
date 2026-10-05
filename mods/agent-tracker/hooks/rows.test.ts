import { expect, test } from 'claude-code/testing'

import { finish, formatDuration, label, rowText, statusOf } from './rows'

test('formatDuration', async () => {
  expect(formatDuration(4_400)).toBe('4s')
  expect(formatDuration(125_000)).toBe('2m05s')
  expect(formatDuration(-5)).toBe('0s')
})

test('label falls back to the type when the description is blank', async () => {
  expect(label('Find auth code', 'Explore')).toBe('Explore: Find auth code')
  expect(label('  ', 'Explore')).toBe('Explore')
})

test('only an answer is a success', async () => {
  expect(statusOf('answer')).toBe('done')
  for (const reason of ['aborted', 'error', 'refusal']) expect(statusOf(reason)).toBe('failed')
})

test('finish closes only the matching row and freezes its duration', async () => {
  const rows = [
    { id: 'a', label: 'A', status: 'running' as const, startedAt: 0 },
    { id: 'b', label: 'B', status: 'running' as const, startedAt: 0 },
  ]
  const out = finish(rows, 'a', 'answer', 5_000)
  expect(out[0]).toEqual({ id: 'a', label: 'A', status: 'done', startedAt: 0, endedAt: 5_000 })
  expect(out[1]).toEqual(rows[1])
  expect(rowText(out[0]!, 99_000)).toBe('✓ A · 5s')
  expect(rowText(out[1]!, 99_000)).toBe('⏳ B · 1m39s')
})
