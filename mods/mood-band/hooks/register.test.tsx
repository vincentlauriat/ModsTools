import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'mood-band',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false } as never,
} as const

function world(on: On, results: unknown[] = []) {
  const clock = mock.clock(on, { now: 0 })
  let i = 0
  mock.store(on)
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined as never }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => (results[i++] ?? { result: 'ok' }) as never)
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return clock
}

const complete = (durationMs?: number, isAborted = false, agentId?: string) =>
  ({ answer: 'done', isAborted, turnId: 't', reason: isAborted ? 'aborted' : 'answer', durationMs, agentId }) as never

async function turn($: Engine, calls: number, durationMs = 5_000, isAborted = false) {
  await $.prompt.submit({ text: 'go' } as never)
  for (let i = 0; i < calls; i++) await $.tool.call({ tool: 'Bash', command: 'true' })
  await $.turn.complete(complete(durationMs, isAborted))
}

const on$ = ($: Engine) => $.command.run({ command: 'mood', args: 'on' } as never)

async function show($: Engine, text: string) {
  const ui = await $.ui.mount(BAND)
  const found = await ui.find({ type: 'Text', text })
  await ui.unmount()
  return found
}

test('off by default: nothing drawn even after a turn', async ($, on) => {
  const clock = world(on)
  await turn($, 2)
  await clock.settle()
  expect(await show($, '(^‿^) Tout roule')).toBeUndefined()
})

test('/mood on shows a happy mascot after a clean turn', async ($, on) => {
  const clock = world(on)
  await on$($)
  await turn($, 2)
  await clock.settle()
  expect(await show($, '(^‿^) Tout roule')).toBeDefined()
})

test('a failed tool call worries the mascot', async ($, on) => {
  const clock = world(on, [{ result: 'ok' }, { result: 'boom', isError: true }])
  await on$($)
  await turn($, 2)
  await clock.settle()
  expect(await show($, '(•_•;) Aïe')).toBeDefined()
})

test('a long turn is focused; an aborted turn is sad', async ($, on) => {
  const clock = world(on)
  await on$($)
  await turn($, 1, 150_000)
  await clock.settle()
  expect(await show($, '(•̀ᴗ•́) Ça chauffe')).toBeDefined()
  await turn($, 1, 1_000, true)
  await clock.settle()
  expect(await show($, '(╥﹏╥) Ça a coincé')).toBeDefined()
})

test('30 minutes idle makes it sleepy', async ($, on) => {
  const clock = world(on)
  await on$($)
  await turn($, 1)
  await clock.advance(31 * 60_000)
  expect(await show($, '(-_-) zzz Je dors')).toBeDefined()
})

test('/mood off hides it again and bare /mood reports the state', async ($, on) => {
  const clock = world(on)
  await on$($)
  await turn($, 1)
  await clock.settle()
  expect(((await $.command.run({ command: 'mood', args: '' } as never)) as { text: string }).text).toContain('is on')
  const out = (await $.command.run({ command: 'mood', args: 'off' } as never)) as { text: string }
  expect(out.text).toBe('mood-band off.')
  expect(await show($, '(^‿^) Tout roule')).toBeUndefined()
})
