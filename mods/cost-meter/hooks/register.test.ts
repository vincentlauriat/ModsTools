import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

type Usage = { startedAt: number; context: { window: number }; rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]; cost?: { usd: number } }

function world(on: On, usage: { current: Usage }) {
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  on('session.start', () => ({ cwd: '/p' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.register', () => ({ value: undefined as never }))
  on('session.usage', () => ({ value: usage.current as never }))
  on('clock.now', () => ({ value: 3_600_000 + 5 * 60_000 }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { statuses, toasts }
}

const base: Usage = { startedAt: 5 * 60_000, context: { window: 200_000 }, rateLimits: [], cost: { usd: 1.234 } }
const complete = (agentId?: string) => ({ answer: 'done', isAborted: false, turnId: 't', reason: 'answer', agentId }) as never
const done = ($: Engine, agentId?: string) => $.turn.complete(complete(agentId))

test('status shows cost and the most constrained rate-limit window', async ($, on) => {
  const usage = { current: { ...base, rateLimits: [{ kind: 'seven_day', percentUsed: 12 }, { kind: 'five_hour', percentUsed: 41.6 }] } }
  const { statuses } = world(on, usage)
  await done($)
  expect(statuses.at(-1)).toBe('$1.23 · 5h 42%')
})

test('absent figures are hidden, never shown as zero', async ($, on) => {
  const usage = { current: { ...base, cost: undefined } as Usage }
  const { statuses } = world(on, usage)
  await done($)
  expect(statuses.at(-1)).toBeUndefined()
  usage.current = { ...base, rateLimits: [{ kind: 'five_hour', percentUsed: 7 }], cost: undefined }
  await done($)
  expect(statuses.at(-1)).toBe('5h 7%')
  usage.current = base
  await done($)
  expect(statuses.at(-1)).toBe('$1.23')
})

test('a subagent turn does not refresh, session.start does', async ($, on) => {
  const usage = { current: base }
  const { statuses } = world(on, usage)
  await done($, 'agent-1')
  expect(statuses.length).toBe(0)
  await $.session.start({ source: 'startup' } as never)
  expect(statuses.at(-1)).toBe('$1.23')
})

test('toasts once when the cost crosses the default $5 threshold', async ($, on) => {
  const usage = { current: { ...base, cost: { usd: 4.99 } } }
  const { toasts } = world(on, usage)
  await done($)
  expect(toasts.length).toBe(0)
  usage.current = { ...base, cost: { usd: 5.2 } }
  await done($)
  await done($)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('$5.20')
})

test('the threshold comes from userConfig', { options: { thresholdUsd: 1 } }, async ($, on) => {
  const { toasts } = world(on, { current: base })
  await done($)
  expect(toasts.length).toBe(1)
})

test('/cost-meter summarises cost, windows and duration', async ($, on) => {
  const usage = { current: { ...base, rateLimits: [{ kind: 'five_hour', percentUsed: 41.6, resetsAt: '2026-10-04T18:00:00Z' }] } }
  world(on, usage)
  const out = (await $.command.run({ command: 'cost-meter', args: '' } as never)) as { text: string }
  expect(out.text).toContain('Cost: $1.23')
  expect(out.text).toContain('Rate limit 5h: 41.6% used, resets 2026-10-04T18:00:00Z')
  expect(out.text).toContain('Session duration: 1h00m')
})
