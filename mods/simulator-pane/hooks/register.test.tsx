import { expect, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PANE = {
  plugin: 'simulator-pane',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'simulator-pane',
  props: { title: 'Simulators', isFocused: false, bodyColumns: 80, placement: 'dock' } as never,
} as const

const PHONE = '11111111-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
const WATCH = '22222222-BBBB-4BBB-8BBB-BBBBBBBBBBBB'
const IOS = 'com.apple.CoreSimulator.SimRuntime.iOS-27-0'
const WATCHOS = 'com.apple.CoreSimulator.SimRuntime.watchOS-27-0'

const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false }) as ProcessRunResult

type Mode = 'ok' | 'missing' | 'garbage'

// Booted: an iPhone (iOS 27.0) and a watch (watchOS 27.0). `simctl shutdown` removes them from the booted set.
function world(on: On) {
  const booted = new Map<string, { name: string; runtime: string }>([
    [PHONE, { name: 'iPhone 17', runtime: IOS }],
    [WATCH, { name: 'Apple Watch Series 12', runtime: WATCHOS }],
  ])
  const w = { calls: [] as string[][], toasts: [] as string[], statuses: [] as (string | undefined)[], mode: 'ok' as Mode, booted }
  on('session.start', () => ({ cwd: '/p' }))
  on('command.register', () => ({ value: undefined as never }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    w.calls.push(argv)
    if (w.mode === 'missing') throw new Error('xcrun: no such file')
    if (argv.join(' ') === 'xcrun simctl list devices booted -j') {
      if (w.mode === 'garbage') return { value: ran('', 72, 'xcrun: error: unable to find utility "simctl"') }
      const devices: Record<string, unknown[]> = { [IOS]: [], [WATCHOS]: [] }
      for (const [udid, d] of booted) devices[d.runtime]!.push({ udid, name: d.name, state: 'Booted', isAvailable: true })
      return { value: ran(JSON.stringify({ devices })) }
    }
    if (argv[1] === 'simctl' && argv[2] === 'shutdown') {
      const target = argv[3]!
      if (target === 'all') booted.clear()
      else if (!booted.delete(target)) return { value: ran('', 149, 'Unable to shutdown device in current state: Shutdown') }
      return { value: ran('') }
    }
    throw new Error(`unexpected ${argv.join(' ')}`)
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    w.statuses.push(e.text)
    return { value: undefined }
  })
  return w
}

const opened = ($: Engine, args = '') => $.command.run({ command: 'simulators', args } as never) as Promise<{ text: string }>
const start = ($: Engine) => $.session.start({ source: 'startup' } as never)
const done = ($: Engine, agentId?: string) =>
  $.turn.complete({ answer: 'done', isAborted: false, turnId: 't', reason: 'answer', agentId } as never)
const shutdowns = (calls: string[][]) => calls.filter(c => c[2] === 'shutdown').map(c => c.join(' '))

test('the pane lists booted simulators with runtime and short UDID', async ($, on) => {
  world(on)
  expect((await opened($)).text).toBe('Simulators pane opened (2 booted simulators).')

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '2 booted simulators' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'iPhone 17 · iOS 27.0 · 11111111' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Apple Watch Series 12 · watchOS 27.0 · 22222222' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: `shutdown:${PHONE}`, text: 'Shut down' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'shutdown-all', text: 'Shut down all' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'refresh', text: 'Refresh' })).toBeDefined()
  await ui.unmount()
})

test('two-step shut down: the first press only arms, the second runs simctl, refreshes and toasts', async ($, on) => {
  const w = world(on)
  await opened($)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: `shutdown:${PHONE}` })
  expect(shutdowns(w.calls)).toEqual([])
  expect(await ui.find({ type: 'Button', key: `shutdown:${PHONE}`, text: 'Confirm?' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: `shutdown:${WATCH}`, text: 'Shut down' })).toBeDefined()

  await ui.press({ key: `shutdown:${PHONE}` })
  expect(shutdowns(w.calls)).toEqual([`xcrun simctl shutdown ${PHONE}`])
  expect(w.toasts).toEqual(['Shut down iPhone 17'])
  expect(await ui.find({ type: 'Button', key: `shutdown:${PHONE}` })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '1 booted simulator' })).toBeDefined()
  expect(w.statuses.at(-1)).toBe('📱 1 booted')
  await ui.unmount()
})

test('Shut down all asks first, then runs simctl shutdown all', async ($, on) => {
  const w = world(on)
  await opened($)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'shutdown-all' })
  expect(shutdowns(w.calls)).toEqual([])
  expect(await ui.find({ type: 'Button', key: 'shutdown-all', text: 'Confirm?' })).toBeDefined()
  await ui.press({ key: 'shutdown-all' })
  expect(shutdowns(w.calls)).toEqual(['xcrun simctl shutdown all'])
  expect(w.toasts).toEqual(['Shut down all simulators'])
  expect(await ui.find({ type: 'Text', text: 'No booted simulators' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'shutdown-all' })).toBeUndefined()
  expect(w.statuses.at(-1)).toBeUndefined()
  await ui.unmount()
})

test('a refresh or another press resets the pending confirm', async ($, on) => {
  const w = world(on)
  await opened($)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: `shutdown:${PHONE}` })
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Button', key: `shutdown:${PHONE}`, text: 'Shut down' })).toBeDefined()

  await ui.press({ key: `shutdown:${PHONE}` })
  await ui.press({ key: 'shutdown-all' })
  expect(await ui.find({ type: 'Button', key: `shutdown:${PHONE}`, text: 'Shut down' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'shutdown-all', text: 'Confirm?' })).toBeDefined()
  expect(shutdowns(w.calls)).toEqual([])
  await ui.unmount()
})

test('a failing shutdown toasts and shows simctl’s message', async ($, on) => {
  const w = world(on)
  await opened($)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: `shutdown:${PHONE}` })
  w.booted.delete(PHONE) // shut down elsewhere in the meantime
  await ui.press({ key: `shutdown:${PHONE}` })
  expect(w.toasts).toEqual(['simctl shutdown failed: Unable to shutdown device in current state: Shutdown'])
  expect(await ui.find({ type: 'Text', text: 'simctl shutdown failed: Unable to shutdown device in current state: Shutdown' })).toBeDefined()
  await ui.unmount()
})

for (const mode of ['missing', 'garbage'] as const) {
  test(`without Xcode (${mode}) the pane says simctl unavailable`, async ($, on) => {
    const w = world(on)
    w.mode = mode
    expect((await opened($)).text).toBe('simctl unavailable')

    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: 'simctl unavailable' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'shutdown-all' })).toBeUndefined()
    await ui.unmount()
    expect(w.statuses.at(-1)).toBeUndefined()
  })
}

test('status line at session start and after main turns only, one simctl call each', async ($, on) => {
  const w = world(on)
  await start($)
  expect(w.statuses.at(-1)).toBe('📱 2 booted')
  expect(w.calls).toEqual([['xcrun', 'simctl', 'list', 'devices', 'booted', '-j']])

  w.booted.delete(WATCH)
  await done($, 'agent-1')
  expect(w.calls.length).toBe(1)
  await done($)
  expect(w.calls.length).toBe(2)
  expect(w.statuses.at(-1)).toBe('📱 1 booted')
  w.booted.clear()
  await done($)
  expect(w.statuses.at(-1)).toBeUndefined()
})

test('statusLine false: no status and no simctl call per turn', { options: { statusLine: false } }, async ($, on) => {
  const w = world(on)
  await start($)
  await done($)
  expect(w.calls).toEqual([])
  expect(w.statuses).toEqual([])
  expect((await opened($)).text).toBe('Simulators pane opened (2 booted simulators).')
  expect(w.statuses).toEqual([])
})

test('close closes the pane', async ($, on) => {
  world(on)
  expect((await opened($, 'close')).text).toBe('Simulators pane closed.')
})
