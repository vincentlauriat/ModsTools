import { expect, test } from 'claude-code/testing'

import { KEEP_DAYS, busiestHour, lastDays, normalize, promptLength, prune, record, report, sparkline } from './stats'

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()

test('record counts prompts, characters and the local hour per local day', async () => {
  let days = record({}, at(5, 9, 15), 10)
  days = record(days, at(5, 9, 50), 30)
  days = record(days, at(5, 23, 59), 5)
  days = record(days, at(6, 0, 1), 7)
  expect(days['2026-10-05']?.count).toBe(3)
  expect(days['2026-10-05']?.chars).toBe(45)
  expect(days['2026-10-05']?.hours[9]).toBe(2)
  expect(days['2026-10-05']?.hours[23]).toBe(1)
  expect(days['2026-10-06']?.hours[0]).toBe(1)
})

test('only the last 90 days are kept', async () => {
  const days = prune({ '2026-07-07': { count: 1, chars: 1, hours: Array(24).fill(0) }, '2026-07-08': { count: 1, chars: 1, hours: Array(24).fill(0) } }, '2026-10-05')
  expect(KEEP_DAYS).toBe(90)
  expect(Object.keys(days)).toEqual(['2026-07-08'])
})

test('promptLength counts code points', async () => {
  expect(promptLength('héllo 👋')).toBe(7)
})

test('normalize drops malformed entries', async () => {
  const good = { count: 2, chars: 9, hours: Array(24).fill(0) }
  expect(normalize({ '2026-10-05': good, '2026-10-04': { count: 'x' }, bad: good, '2026-10-03': { ...good, hours: [1] } })).toEqual({ '2026-10-05': good })
  expect(normalize(undefined)).toEqual({})
  expect(normalize([1])).toEqual({})
})

test('lastDays crosses month boundaries', async () => {
  expect(lastDays('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02'])
})

test('sparkline has 24 columns, ▁ for empty hours, █ for the busiest', async () => {
  const hours = Array(24).fill(0)
  hours[10] = 8
  hours[14] = 1
  const line = sparkline(hours)
  expect([...line]).toHaveLength(24)
  expect([...line][0]).toBe('▁')
  expect([...line][10]).toBe('█')
  expect([...line][14]).toBe('▂')
  expect(sparkline(Array(24).fill(0))).toBe('▁'.repeat(24))
  expect(busiestHour(hours)).toBe(10)
  expect(busiestHour(Array(24).fill(0))).toBeUndefined()
})

test('report shows today, 7 day bars, the average and the busiest hour', async () => {
  let days = record({}, at(5, 14), 100)
  days = record(days, at(5, 14), 200)
  days = record(days, at(3, 9), 60)
  const text = report(days, '2026-10-05', 'default')
  expect(text).toContain('Today: 2 prompts, 300 characters (avg 150)')
  expect(text).toContain('Last 7 days: 3 prompts')
  expect(text).toContain('Mon 10-05     2  ' + '█'.repeat(20))
  expect(text).toContain('Sat 10-03     1  ' + '█'.repeat(10))
  expect(text).toContain('Tue 09-29     0')
  expect(text).toContain('Average prompt length: 120 characters')
  expect(text).toContain('Busiest hour: 14:00-15:00 (2 prompts)')
})

test('month spans 30 days and omits today', async () => {
  const days = record({}, at(5, 8), 10)
  const text = report(days, '2026-10-05', 'month')
  expect(text).toContain('Last 30 days: 1 prompt')
  expect(text).toContain('Sun 09-06')
  expect(text).not.toContain('Today:')
})
