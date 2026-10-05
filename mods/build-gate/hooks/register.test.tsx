import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'build-gate',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false } as never,
} as const

function world(on: On) {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: 'ok' as never }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

type Step = { tool: string; [key: string]: unknown }
const SWIFT: Step = { tool: 'Edit', file_path: '/p/A.swift', old_string: 'a', new_string: 'b' }
const PY: Step = { tool: 'Write', file_path: '/p/a.py', content: 'x' }
const DOC: Step = { tool: 'Edit', file_path: '/p/README.md', old_string: 'a', new_string: 'b' }
const XCODE: Step = { tool: 'Bash', command: 'rtk xcodebuild -scheme A build' }

async function turn($: Engine, steps: Step[], agentId?: string) {
  await $.prompt.submit({ text: 'go' } as never)
  for (const step of steps) await $.tool.call(step as never)
  await $.turn.complete({ answer: 'ok', isAborted: false, turnId: 't', reason: 'answer', agentId } as never)
}

async function band($: Engine, text: string) {
  const ui = await $.ui.mount(BAND)
  const found = (await ui.find({ type: 'Text', text: new RegExp(text) })) !== undefined
  await ui.unmount()
  return found
}

const status = async ($: Engine) => ((await $.command.run({ command: 'build-gate', args: 'status' } as never)) as { text: string }).text

test('code changed without a build raises the band, listing the languages', async ($, on) => {
  world(on)
  await turn($, [SWIFT, PY])
  expect(await band($, 'Swift, Python changed, no build run this turn')).toBe(true)
})

test('a matching build after the edit, or a doc-only edit, stays quiet', async ($, on) => {
  world(on)
  await turn($, [SWIFT, XCODE])
  await turn($, [DOC])
  await turn($, [])
  expect(await band($, 'build-gate')).toBe(false)
})

test('a build before the edit does not count, and a wrong-language build does not either', async ($, on) => {
  world(on)
  await turn($, [XCODE, SWIFT])
  expect(await band($, 'Swift changed')).toBe(true)
  await turn($, [PY, { tool: 'Bash', command: 'cargo test' }])
  expect(await band($, 'Python')).toBe(true)
})

test('the band clears on the next turn that runs a matching check, partly or fully', async ($, on) => {
  world(on)
  await turn($, [SWIFT, PY])
  await turn($, [XCODE])
  expect(await band($, 'Swift')).toBe(false)
  expect(await band($, 'Python changed')).toBe(true)
  await turn($, [{ tool: 'Bash', command: 'pytest -q' }])
  expect(await band($, 'build-gate')).toBe(false)
})

test('Dismiss clears the band', async ($, on) => {
  world(on)
  await turn($, [SWIFT])
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'dismiss' })
  await ui.unmount()
  expect(await band($, 'build-gate')).toBe(false)
})

test('subagent activity and subagent turns are ignored', async ($, on) => {
  world(on)
  await turn($, [{ ...SWIFT, agentId: 'sub' }])
  await turn($, [SWIFT], 'sub')
  expect(await band($, 'build-gate')).toBe(false)
})

test('off disables, on restores, status reports the last turn', async ($, on) => {
  world(on)
  expect(await status($)).toBe('build-gate is on. No turn completed yet.')
  await $.command.run({ command: 'build-gate', args: 'off' } as never)
  await turn($, [SWIFT])
  expect(await band($, 'build-gate')).toBe(false)
  await $.command.run({ command: 'build-gate', args: 'on' } as never)
  await turn($, [SWIFT, PY, { tool: 'Bash', command: 'ruff check .' }])
  expect(await status($)).toBe('build-gate is on. Last turn: changed: Swift, Python; no matching build: Swift.')
})
