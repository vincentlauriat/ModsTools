import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'context-gauge',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false } as never,
} as const

function world(on: On, usage: { percent?: number }) {
  on('session.start', () => ({ cwd: '/p' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: usage.percent }, rateLimits: [] } as never }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const done = ($: Engine, agentId?: string) => $.turn.complete({ answer: 'done', isAborted: false, turnId: 't', reason: 'answer', agentId } as never)

async function drawn($: Engine) {
  const ui = await $.ui.mount(BAND)
  const gauge = await ui.find({ type: 'Text', text: /Context/ })
  const engine = await ui.find({ type: 'Text', text: 'engine' })
  await ui.unmount()
  return { gauge, engine }
}

test('shows the gauge from 70% with the bar and the advice', async ($, on) => {
  world(on, { percent: 78 })
  await done($)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'Context 78% ▓▓▓▓▓▓▓▓░░ — consider /compact' })).toBeDefined()
  await ui.unmount()
})

test('below 70% nothing is drawn', async ($, on) => {
  world(on, { percent: 69 })
  await done($)
  const { gauge, engine } = await drawn($)
  expect(gauge).toBeUndefined()
  expect(engine).toBeDefined()
})

test('absent percent draws nothing, not 0%', async ($, on) => {
  world(on, {})
  await $.session.start({ source: 'startup' } as never)
  const { gauge, engine } = await drawn($)
  expect(gauge).toBeUndefined()
  expect(engine).toBeDefined()
})

test('the gauge follows the usage: appears at turn end, goes after a compaction', async ($, on) => {
  const usage: { percent?: number } = { percent: 50 }
  world(on, usage)
  await done($)
  expect((await drawn($)).gauge).toBeUndefined()
  usage.percent = 95
  await done($)
  expect((await drawn($)).gauge).toBeDefined()
  usage.percent = undefined
  await done($)
  expect((await drawn($)).gauge).toBeUndefined()
})

test('a subagent turn does not refresh the gauge', async ($, on) => {
  const usage: { percent?: number } = { percent: 80 }
  world(on, usage)
  await done($, 'agent-1')
  expect((await drawn($)).gauge).toBeUndefined()
})

test('90% and over is red, below is yellow', async ($, on) => {
  const usage: { percent?: number } = { percent: 91 }
  world(on, usage)
  await done($)
  const ui = await $.ui.mount(BAND)
  const hot = (await ui.find({ type: 'Text', text: /Context/ })) as { props?: { color?: string } } | undefined
  await ui.unmount()
  expect(hot?.props?.color).toBe('red')
})
