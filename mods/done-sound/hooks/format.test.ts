import { expect, test } from 'claude-code/testing'

import { shouldPlay } from './format'

test('the threshold is inclusive and in seconds', async () => {
  expect(shouldPlay(29_999, 30)).toBe(false)
  expect(shouldPlay(30_000, 30)).toBe(true)
  expect(shouldPlay(5_000, 5)).toBe(true)
})
