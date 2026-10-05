import { expect, test } from 'claude-code/testing'

import { FRESH, bump, dayKey, peak, summary, toastText } from './budget'

test('bump toasts once, on the first spawn over the budget', async () => {
  let t = FRESH
  const toasts: boolean[] = []
  for (let i = 0; i < 4; i++) {
    const out = bump(t, 2, true)
    t = out.turn
    toasts.push(out.toast)
  }
  expect(toasts).toEqual([false, false, true, false])
  expect(t).toEqual({ count: 4, toasted: true })
  expect(bump({ count: 5, toasted: false }, 2, false)).toEqual({ turn: { count: 6, toasted: false }, toast: false })
  expect(toastText(11, 10)).toBe('subagent-budget: 11 subagents this turn (budget 10)')
})

test('dayKey is the local calendar day', async () => {
  expect(dayKey(new Date(2026, 9, 5, 23, 59).getTime())).toBe('2026-10-05')
  expect(dayKey(new Date(2026, 0, 2, 0, 1).getTime())).toBe('2026-01-02')
})

test('peak keeps today\'s maximum and starts over on another day', async () => {
  expect(peak(undefined, '2026-10-05', 3)).toEqual({ day: '2026-10-05', max: 3 })
  expect(peak({ day: '2026-10-05', max: 7 }, '2026-10-05', 3)).toEqual({ day: '2026-10-05', max: 7 })
  expect(peak({ day: '2026-10-04', max: 7 }, '2026-10-05', 3)).toEqual({ day: '2026-10-05', max: 3 })
  expect(peak('garbage', '2026-10-05', 0)).toEqual({ day: '2026-10-05', max: 0 })
})

test('summary', async () => {
  expect(summary(2, 5, 10, false)).toBe('Subagents this turn: 2\nMax in one turn today: 5\nBudget: 10 per turn (alerts off)')
})
