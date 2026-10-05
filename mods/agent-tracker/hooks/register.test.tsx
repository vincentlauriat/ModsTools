import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-tracker',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'agent-tracker',
  props: { title: 'Agents', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
} as const

// Every spawn starts agent `a1`, `a2`, ... unless `deny` is set.
function world(on: On, opts: { deny?: string } = {}) {
  const clock = mock.clock(on, { now: 0 })
  const closed: string[] = []
  let n = 0
  on('agent.spawn', () =>
    opts.deny === undefined ? { model: 'm', agentId: `a${++n}` } : { deny: opts.deny },
  )
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', ($, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  return { clock, closed }
}

const spawn = ($: Engine, description: string, extra: object = {}) =>
  $.agent.spawn({ prompt: 'p', description, subagentType: 'Explore', background: false, fork: false, tool_use_id: 't', parentModel: 'm', provider: { plugin: 'x', tier: 'core' }, ...extra } as never)

const end = ($: Engine, agentId: string | undefined, reason = 'answer') =>
  $.turn.complete({ answer: 'ok', isAborted: reason === 'aborted', turnId: 't', reason, durationMs: 1, agentId } as never)

const pane = async ($: Engine) => $.ui.mount(PANE)

test('a spawned agent shows as running, then done with its duration', async ($, on) => {
  const { clock } = world(on)
  await spawn($, 'Find auth code')

  const ui = await pane($)
  expect(await ui.find({ type: 'Text', text: '⏳ Explore: Find auth code · 0s' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 agent · 1 running' })).toBeDefined()
  await ui.unmount()

  await clock.advance(42_000)
  await end($, 'a1')
  const after = await pane($)
  expect(await after.find({ type: 'Text', text: '✓ Explore: Find auth code · 42s' })).toBeDefined()
  expect(await after.find({ type: 'Text', text: '1 agent · 0 running' })).toBeDefined()
  await after.unmount()
})

test('an aborted or errored subagent turn is failed', async ($, on) => {
  const { clock } = world(on)
  await spawn($, 'one')
  await spawn($, 'two')
  await clock.advance(3_000)
  await end($, 'a1', 'aborted')
  await end($, 'a2', 'error')

  const ui = await pane($)
  expect(await ui.find({ type: 'Text', text: '✗ Explore: one · 3s' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✗ Explore: two · 3s' })).toBeDefined()
  await ui.unmount()
})

test('the main loop turn.complete and unknown ids change nothing', async ($, on) => {
  world(on)
  await spawn($, 'work')
  await end($, undefined)
  await end($, 'other')

  const ui = await pane($)
  expect(await ui.find({ type: 'Text', text: '⏳ Explore: work · 0s' })).toBeDefined()
  await ui.unmount()
})

test('a refused spawn and a teammate are not listed', async ($, on) => {
  world(on, { deny: 'no' })
  await spawn($, 'refused')
  await spawn($, 'mate', { isTeammate: true })

  const ui = await pane($)
  expect(await ui.find({ type: 'Text', text: '0 agents · 0 running' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'No subagent launched yet.' })).toBeDefined()
  await ui.unmount()
})

test('/agent-tracker clear drops finished agents only; close closes the pane', async ($, on) => {
  const { closed } = world(on)
  await spawn($, 'done one')
  await spawn($, 'still going')
  await end($, 'a1')

  const ran = await $.command.run({ command: 'agent-tracker', args: 'clear' } as never)
  expect((ran as { text: string }).text).toBe('Finished agents cleared.')
  const ui = await pane($)
  expect(await ui.find({ type: 'Text', text: /done one/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /⏳ Explore: still going/ })).toBeDefined()
  await ui.unmount()

  await $.command.run({ command: 'agent-tracker', args: 'close' } as never)
  expect(closed).toEqual(['agent-tracker'])
})
