import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const NOW = new Date(2026, 9, 4, 14, 30).getTime()
const DONE = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't' } as never

function world(on: On, days?: string[]) {
  mock.store(on, days === undefined ? undefined : { days })
  mock.clock(on, { now: NOW })
  on('command.register', () => ({ value: undefined as never }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
}

async function streak($: Engine) {
  return ((await $.command.run({ command: 'streak', args: '' } as never)).text ?? '')
}

test('a completed turn starts a streak of one day', async ($, on) => {
  world(on)
  await $.turn.complete(DONE)
  const text = await streak($)
  expect(text).toContain('Current streak: 1 day')
  expect(text).toContain('Active days: 1')
})

test('a turn today extends a streak that ran through yesterday', async ($, on) => {
  world(on, ['2026-10-02', '2026-10-03'])
  await $.turn.complete(DONE)
  const text = await streak($)
  expect(text).toContain('Current streak: 3 days')
  expect(text).toContain('Longest streak: 3')
})

test('a missed day resets the current streak to the new day', async ($, on) => {
  world(on, ['2026-09-28', '2026-09-29', '2026-09-30'])
  await $.turn.complete(DONE)
  const text = await streak($)
  expect(text).toContain('Current streak: 1 day')
  expect(text).toContain('Longest streak: 3')
  expect(text).toContain('Active days: 4')
})

test('subagent turns do not count', async ($, on) => {
  world(on)
  await $.turn.complete({ ...(DONE as object), agentId: 'sub' } as never)
  expect(await streak($)).toContain('Active days: 0')
})

test('several turns the same day count once', async ($, on) => {
  world(on)
  await $.turn.complete(DONE)
  await $.turn.complete(DONE)
  expect(await streak($)).toContain('Active days: 1')
})

test('the 7th consecutive day shows the status line and toasts once', async ($, on) => {
  world(on, ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'])
  const toasts: string[] = []
  const statuses: (string | undefined)[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined as never }
  })
  on('ui.status', ($, e) => {
    statuses.push(e.text)

    return { value: undefined as never }
  })
  await $.turn.complete(DONE)
  await $.turn.complete(DONE)
  expect(toasts).toEqual(['🔥 7-day streak!'])
  expect(statuses.at(-1)).toBe('🔥 7-day streak')
})
