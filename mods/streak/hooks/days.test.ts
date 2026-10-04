import { expect, test } from 'claude-code/testing'

import { addDay, crossedMilestone, dayKey, stats, statusLine } from './days'

test('dayKey uses the local calendar day', async () => {
  expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05')
  expect(dayKey(new Date(2026, 0, 6, 0, 1).getTime())).toBe('2026-01-06')
})

test('streak runs across month and year boundaries', async () => {
  const s = stats(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'], '2026-01-02')
  expect(s).toEqual({ current: 4, longest: 4, total: 4 })
  expect(stats(['2026-02-28', '2026-03-01'], '2026-03-01').current).toBe(2)
  expect(stats(['2024-02-28', '2024-02-29', '2024-03-01'], '2024-03-01').current).toBe(3)
})

test('a gap resets current but keeps longest', async () => {
  const s = stats(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-06'], '2026-03-06')
  expect(s).toEqual({ current: 1, longest: 3, total: 4 })
})

test('streak stays alive through yesterday and is 0 after a missed day', async () => {
  expect(stats(['2026-03-01', '2026-03-02'], '2026-03-03').current).toBe(2)
  expect(stats(['2026-03-01', '2026-03-02'], '2026-03-04').current).toBe(0)
  expect(stats([], '2026-03-04')).toEqual({ current: 0, longest: 0, total: 0 })
})

test('addDay dedupes, sorts and keeps the last 400 days', async () => {
  expect(addDay(['2026-03-02', '2026-03-01'], '2026-03-02')).toEqual(['2026-03-01', '2026-03-02'])
  const many = Array.from({ length: 400 }, (_, i) => dayKey(new Date(2025, 0, 1 + i).getTime()))
  const out = addDay(many, '2026-06-01')
  expect(out).toHaveLength(400)
  expect(out[0]).toBe(many[1])
})

test('milestones are crossed only when growing past them', async () => {
  expect(crossedMilestone(6, 7)).toBe(7)
  expect(crossedMilestone(7, 8)).toBeUndefined()
  expect(crossedMilestone(0, 1)).toBeUndefined()
  expect(crossedMilestone(29, 30)).toBe(30)
})

test('status line shows singular for one day and hides at zero', async () => {
  expect(statusLine(1)).toBe('🔥 1 day')
  expect(statusLine(5)).toBe('🔥 5-day streak')
  expect(statusLine(0)).toBeUndefined()
})
