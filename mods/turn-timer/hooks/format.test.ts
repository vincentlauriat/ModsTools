import { expect, test } from 'claude-code/testing'

import { formatDuration } from './format'

test('durations under a minute are seconds, longer ones minutes and padded seconds', async () => {
  expect(formatDuration(42_000)).toBe('42s')
  expect(formatDuration(400)).toBe('0s')
  expect(formatDuration(59_600)).toBe('1m00s')
  expect(formatDuration(125_000)).toBe('2m05s')
  expect(formatDuration(3_725_000)).toBe('62m05s')
})
