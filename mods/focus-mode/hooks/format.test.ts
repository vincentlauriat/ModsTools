import { expect, test } from 'claude-code/testing'

import { bandText, minutesLeft, parseMinutes } from './format'

test('parseMinutes defaults to 25 and rejects junk', async () => {
  expect(parseMinutes('')).toBe(25)
  expect(parseMinutes('10')).toBe(10)
  expect(parseMinutes('0')).toBeNull()
  expect(parseMinutes('abc')).toBeNull()
  expect(parseMinutes('999')).toBeNull()
})

test('minutes left round up and never show 0', async () => {
  expect(minutesLeft(18 * 60_000, 0)).toBe(18)
  expect(minutesLeft(60_001, 0)).toBe(2)
  expect(minutesLeft(10, 0)).toBe(1)
  expect(bandText(18 * 60_000, 0)).toBe('🎯 Focus 18 min left')
})
