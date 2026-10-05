import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'verify-before-claim',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false } as never,
} as const
const MESSAGE = 'verify-before-claim: success claimed without running a build or test this turn'

function world(on: On) {
  const toasts: string[] = []
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
  return { toasts }
}

type Step = { tool: string; [key: string]: unknown }
const EDIT: Step = { tool: 'Edit', file_path: '/p/a.ts', old_string: 'a', new_string: 'b' }
const BUILD: Step = { tool: 'Bash', command: 'rtk npm run build' }

async function turn($: Engine, steps: Step[], answer: string, agentId?: string) {
  await $.prompt.submit({ text: 'go' } as never)
  for (const step of steps) await $.tool.call(step as never)
  await $.turn.complete({ answer, isAborted: false, turnId: 't', reason: 'answer', agentId } as never)
}

async function hasBand($: Engine) {
  const ui = await $.ui.mount(BAND)
  const found = (await ui.find({ type: 'Text', text: new RegExp(MESSAGE) })) !== undefined
  await ui.unmount()
  return found
}

const status = async ($: Engine) => ((await $.command.run({ command: 'verify-before-claim', args: 'status' } as never)) as { text: string }).text

test('code changed + success claim + no check raises a toast and a band', async ($, on) => {
  const { toasts } = world(on)
  await turn($, [EDIT], "C'est corrigé.")
  expect(toasts).toEqual([MESSAGE])
  expect(await hasBand($)).toBe(true)
})

test('a check run in the turn, a doc-only edit or no claim stay quiet', async ($, on) => {
  const { toasts } = world(on)
  await turn($, [EDIT, BUILD], "C'est corrigé.")
  await turn($, [{ tool: 'Edit', file_path: '/p/README.md', old_string: 'a', new_string: 'b' }], 'Fixed.')
  await turn($, [EDIT], 'I changed the parser.')
  expect(toasts).toEqual([])
  expect(await hasBand($)).toBe(false)
})

test('the band clears on the next turn that runs a check, and Dismiss clears it too', async ($, on) => {
  world(on)
  await turn($, [EDIT], 'Fixed.')
  await turn($, [], 'Anything else?')
  expect(await hasBand($)).toBe(true)
  await turn($, [BUILD], 'Checked.')
  expect(await hasBand($)).toBe(false)

  await turn($, [EDIT], 'Done.')
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'dismiss' })
  await ui.unmount()
  expect(await hasBand($)).toBe(false)
})

test('subagent activity and subagent turns are ignored', async ($, on) => {
  const { toasts } = world(on)
  await turn($, [{ ...EDIT, agentId: 'sub' }], 'Fixed.')
  expect(toasts).toEqual([])
  await turn($, [EDIT, { ...BUILD, agentId: 'sub' }], 'Fixed.', 'sub')
  expect(toasts).toEqual([])
  await turn($, [EDIT, { ...BUILD, agentId: 'sub' }], 'Fixed.')
  expect(toasts).toEqual([MESSAGE])
})

test('off disables the warning, on restores it, status reports the last turn', async ($, on) => {
  const { toasts } = world(on)
  await $.command.run({ command: 'verify-before-claim', args: 'off' } as never)
  await turn($, [EDIT], 'Fixed.')
  expect(toasts).toEqual([])
  await $.command.run({ command: 'verify-before-claim', args: 'on' } as never)
  await turn($, [EDIT], 'Fixed.')
  expect(toasts).toEqual([MESSAGE])
  expect(await status($)).toBe('verify-before-claim is on. Last turn: code changed: yes, checks run: 0, claim found: yes ("fixed").')
})

test('status before any turn', async ($, on) => {
  world(on)
  expect(await status($)).toBe('verify-before-claim is on. No turn completed yet.')
})
