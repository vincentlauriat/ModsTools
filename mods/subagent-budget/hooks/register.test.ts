import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const NOON = new Date(2026, 9, 5, 12, 0).getTime()

function world(on: On, opts: { deny?: boolean } = {}) {
  const toasts: string[] = []
  const clock = mock.clock(on, { now: NOON })
  mock.store(on)
  let n = 0
  on('agent.spawn', () => (opts.deny === true ? { deny: 'no' } : { model: 'm', agentId: `a${++n}` }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { toasts, clock }
}

const spawn = ($: Engine, extra: object = {}) =>
  $.agent.spawn({
    prompt: 'p',
    description: 'd',
    subagentType: 'Explore',
    background: false,
    fork: false,
    tool_use_id: 't',
    parentModel: 'm',
    provider: { plugin: 'engine', tier: 'core' },
    ...extra,
  } as never)
const prompt = ($: Engine, turnId?: string) => $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' }, turnId } as never)
const status = async ($: Engine, args = '') =>
  ((await $.command.run({ command: 'subagent-budget', args } as never)) as { text: string }).text

test('toasts once per turn when the count exceeds the budget; a new prompt resets', async ($, on) => {
  const { toasts } = world(on)
  await prompt($)
  for (let i = 0; i < 12; i++) await spawn($)
  expect(toasts).toEqual(['subagent-budget: 11 subagents this turn (budget 10)'])
  await prompt($)
  expect(await status($)).toContain('Subagents this turn: 0')
  for (let i = 0; i < 11; i++) await spawn($)
  expect(toasts.length).toBe(2)
})

test('nested and teammate spawns count', async ($, on) => {
  world(on)
  await prompt($)
  await spawn($, { parentAgentId: 'a1' })
  await spawn($, { isTeammate: true, name: 'scout' })
  await spawn($)
  expect(await status($)).toContain('Subagents this turn: 3')
})

test('a denied spawn is not counted', async ($, on) => {
  world(on, { deny: true })
  await spawn($)
  expect(await status($)).toContain('Subagents this turn: 0')
})

test('a prompt delivered into the running turn does not reset', async ($, on) => {
  world(on)
  await prompt($)
  await spawn($)
  await spawn($)
  await prompt($, 'turn-1')
  expect(await status($)).toContain('Subagents this turn: 2')
})

test('today\'s max survives a new turn and starts over the next day', async ($, on) => {
  const { clock } = world(on)
  await prompt($)
  for (let i = 0; i < 4; i++) await spawn($)
  await prompt($)
  await spawn($)
  expect(await status($)).toBe('Subagents this turn: 1\nMax in one turn today: 4\nBudget: 10 per turn')
  await clock.advance(24 * 3_600_000)
  // Yesterday's peak of 4 is gone; only the live turn's count remains.
  expect(await status($)).toContain('Max in one turn today: 1')
})

test('off silences the toast, on brings it back; the budget comes from userConfig', { options: { max: 1 } }, async ($, on) => {
  const { toasts } = world(on)
  expect(await status($, 'off')).toBe('subagent-budget alerts off.')
  await prompt($)
  await spawn($)
  await spawn($)
  expect(toasts).toEqual([])
  expect(await status($)).toContain('Budget: 1 per turn (alerts off)')
  await status($, 'on')
  await prompt($)
  await spawn($)
  await spawn($)
  expect(toasts).toEqual(['subagent-budget: 2 subagents this turn (budget 1)'])
})

test('parallel spawns all count and toast exactly once', async ($, on) => {
  const { toasts } = world(on)
  await prompt($)
  await Promise.all(Array.from({ length: 12 }, () => spawn($)))
  expect(await status($)).toContain('Subagents this turn: 12')
  expect(toasts).toEqual(['subagent-budget: 11 subagents this turn (budget 10)'])
})

test('the peak is saved at the end of a main turn, not by a subagent turn', async ($, on) => {
  const saved: unknown[] = []
  mock.clock(on, { now: NOON })
  on('store.get', () => ({ value: saved.at(-1) }))
  on('store.set', (_$, e) => {
    if (e.key === 'today') saved.push(e.value)
    return { value: undefined }
  })
  let n = 0
  on('agent.spawn', () => ({ model: 'm', agentId: `a${++n}` }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  for (let i = 0; i < 3; i++) await spawn($)
  await $.turn.complete({ answer: 'ok', isAborted: false, turnId: 't', reason: 'answer', durationMs: 1, agentId: 'a1' } as never)
  expect(saved).toEqual([])
  await $.turn.complete({ answer: 'ok', isAborted: false, turnId: 't', reason: 'answer', durationMs: 1 } as never)
  expect(saved).toEqual([{ day: '2026-10-05', max: 3 }])
})
