import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'focus-mode',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false } as never,
} as const

function world(on: On) {
  const toasts: string[] = []
  const clock = mock.clock(on, { now: 0 })
  on('command.register', () => ({ value: undefined as never }))
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

const run = async ($: Engine, args: string) =>
  (await $.command.run({ command: 'focus', args } as never)) as unknown as { text: string }

async function band($: Engine, text: string | RegExp) {
  const ui = await $.ui.mount(BAND)
  const found = await ui.find({ type: 'Text', text })
  await ui.unmount()

  return found !== undefined
}

test('/focus 20 starts and the band shows 20 min, then 18 after two minutes', async ($, on) => {
  const { clock } = world(on)
  expect((await run($, '20')).text).toBe('Focus started: 20 min.')
  expect(await band($, '🎯 Focus 20 min left')).toBe(true)
  await clock.advance(120_000)
  expect(await band($, '🎯 Focus 18 min left')).toBe(true)
})

test('/focus alone starts 25 min, then reports the remaining time while running', async ($, on) => {
  const { clock } = world(on)
  expect((await run($, '')).text).toBe('Focus started: 25 min.')
  await clock.advance(7 * 60_000)
  expect((await run($, '')).text).toBe('Focus: 18 min left.')
})

test('at the end a toast fires and the band offers Dismiss', async ($, on) => {
  const { toasts, clock } = world(on)
  await run($, '2')
  await clock.advance(60_000)
  expect(toasts).toEqual([])
  await clock.advance(60_000)
  expect(toasts).toEqual(['Focus done — take a break'])
  expect(await band($, '🎯 Focus done — take a break')).toBe(true)

  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'dismiss' })
  await ui.unmount()
  expect(await band($, 'engine')).toBe(true)
})

test('/focus stop clears the band and stops the countdown', async ($, on) => {
  const { toasts, clock } = world(on)
  await run($, '2')
  expect((await run($, 'stop')).text).toBe('Focus stopped.')
  await clock.advance(300_000)
  expect(toasts).toEqual([])
  expect(await band($, 'engine')).toBe(true)
})

test('bad argument gives usage and starts nothing', async ($, on) => {
  world(on)
  expect((await run($, 'soon')).text).toContain('Usage')
  expect(await band($, 'engine')).toBe(true)
})
