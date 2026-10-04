import { expect, test } from 'claude-code/testing'

import { formatTokens, parseGain, statusLine } from './gain'

const REAL = JSON.stringify({
  summary: { total_commands: 75812, total_saved: 19278037, avg_savings_pct: 50.183366253034315 },
})

test('parses the real rtk gain json', async () => {
  expect(parseGain(REAL)).toEqual({ saved: 19278037, percent: 50 })
})

test('rejects anything that is not the expected shape', async () => {
  for (const bad of ['', 'RTK Token Savings (Global Scope)', '{}', '{"summary":{}}', '{"summary":{"total_saved":"x"}}', 'null', '{"summary":{"total_saved":-1}}'])
    expect(parseGain(bad)).toBeNull()
})

test('a missing percentage is tolerated', async () => {
  expect(parseGain('{"summary":{"total_saved":1500}}')).toEqual({ saved: 1500, percent: null })
  expect(statusLine({ saved: 1500, percent: null })).toBe('rtk −1.5K tok')
})

test('formats tokens and the status line', async () => {
  expect(formatTokens(999)).toBe('999')
  expect(formatTokens(1_234)).toBe('1.2K')
  expect(statusLine({ saved: 1_234_567, percent: 78 })).toBe('rtk −1.2M tok (78%)')
})
