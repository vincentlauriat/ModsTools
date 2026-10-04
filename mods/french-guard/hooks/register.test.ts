import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const EN = 'I have updated the function so that it now returns the result of the query, and the tests are passing with the new configuration. You can run the build again to check that everything works, and if there is a problem with the output we should look at the logs from the last run. This is what the change does and why it is needed.'

function world(on: On) {
  const toasts: string[] = []
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.register', () => ({ value: undefined as never }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { toasts }
}

const done = ($: Engine, answer: string, agentId?: string) =>
  $.turn.complete({ answer, isAborted: false, turnId: 't', reason: 'answer', agentId } as never)
const run = async ($: Engine, args: string) =>
  (await $.command.run({ command: 'french-guard', args } as never)) as unknown as { text: string }

test('an English answer raises a toast, a French one does not', async ($, on) => {
  const { toasts } = world(on)
  await done($, 'Voilà la réponse, tout est prêt et le projet fonctionne très bien.')
  expect(toasts).toEqual([])
  await done($, EN)
  expect(toasts).toEqual(['french-guard: last answer looks English'])
})

test('subagent answers are ignored', async ($, on) => {
  const { toasts } = world(on)
  await done($, EN, 'sub-1')
  expect(toasts).toEqual([])
})

test('off silences the guard, on restores it', async ($, on) => {
  const { toasts } = world(on)
  expect((await run($, 'off')).text).toBe('french-guard off.')
  await done($, EN)
  expect(toasts).toEqual([])
  await run($, 'on')
  await done($, EN)
  expect(toasts).toHaveLength(1)
})

test('status reports the state and the last check', async ($, on) => {
  world(on)
  await done($, EN)
  expect((await run($, 'status')).text).toBe('french-guard on; last check: french-guard: last answer looks English')
  await done($, 'Tout est prêt.')
  expect((await run($, 'status')).text).toContain('last check: ok')
})
