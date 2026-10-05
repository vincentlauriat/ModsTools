import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'turn-timer',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false } as never,
} as const

function world(on: On) {
  const toasts: string[] = []
  const clock = mock.clock(on, { now: 0 })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: 'ok' as never }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return { toasts, clock }
}

const complete = (durationMs?: number, agentId?: string) => ({
  answer: 'done', isAborted: false, turnId: 't', reason: 'answer', durationMs, agentId,
}) as never

async function turn($: Engine, clock: ReturnType<typeof mock.clock>, tools: number, durationMs?: number) {
  await $.prompt.submit({ text: 'go' } as never)
  for (let i = 0; i < tools; i++) await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.turn.complete(complete(durationMs))
  await clock.settle()
}

test('the band shows the last turn duration and tool count', async ($, on) => {
  const { clock } = world(on)
  await turn($, clock, 12, 42_000)

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: '⏱ last turn 42s · 12 tools' })).toBeDefined()
  await ui.unmount()
})

test('without durationMs the clock between prompt and completion is used', async ($, on) => {
  const { clock } = world(on)
  await $.prompt.submit({ text: 'go' } as never)
  await clock.advance(125_000)
  await $.turn.complete(complete())
  await clock.settle()

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: '⏱ last turn 2m05s · 0 tools' })).toBeDefined()
  await ui.unmount()
})

test('Hide hides the band until the next turn completes', async ($, on) => {
  const { clock } = world(on)
  await turn($, clock, 1, 3_000)

  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /last turn/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await ui.unmount()

  await turn($, clock, 2, 5_000)
  const again = await $.ui.mount(BAND)
  expect(await again.find({ type: 'Text', text: '⏱ last turn 5s · 2 tools' })).toBeDefined()
  await again.unmount()
})

test('a turn over 120s raises a toast, a shorter one does not', async ($, on) => {
  const { toasts, clock } = world(on)
  await turn($, clock, 0, 119_000)
  expect(toasts).toEqual([])

  await turn($, clock, 3, 121_000)
  expect(toasts).toEqual(['Slow turn: 2m01s, 3 tool calls'])
})

test('subagent turns are ignored for the band, but their tool calls count in the main turn', async ($, on) => {
  const { toasts, clock } = world(on)
  await $.prompt.submit({ text: 'go' } as never)
  await $.tool.call({ tool: 'Agent', prompt: 'x' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'sub-1' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'sub-1' } as never)
  await $.turn.complete(complete(500_000, 'sub-1'))
  await clock.settle()

  const before = await $.ui.mount(BAND)
  expect(await before.find({ type: 'Text', text: /last turn/ })).toBeUndefined()
  await before.unmount()
  expect(toasts).toEqual([])

  await $.turn.complete(complete(10_000))
  await clock.settle()
  const after = await $.ui.mount(BAND)
  expect(await after.find({ type: 'Text', text: '⏱ last turn 10s · 3 tools' })).toBeDefined()
  await after.unmount()
})
