import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

function world(on: On, entries: Record<string, unknown> = {}) {
  const toasts: string[] = []
  const sent: string[] = []
  mock.store(on, entries)
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { toasts, sent }
}

const run = ($: Engine, args: string) =>
  $.command.run({ command: 'snip', args } as never)

test('add, list, show and rm round-trip through the store', async ($, on) => {
  world(on)
  expect((await run($, 'add fix Fix the bug.')).text).toBe('Saved ;;fix.')
  expect((await run($, 'add tests Add tests')).text).toBe('Saved ;;tests.')
  expect((await run($, 'list')).text).toBe('Snippets: ;;fix ;;tests')
  expect((await run($, 'show fix')).text).toBe(';;fix = Fix the bug.')
  expect((await run($, 'rm fix')).text).toBe('Removed ;;fix.')
  expect((await run($, 'show fix')).text).toBe('No snippet "fix".')
})

test('snippets saved in an earlier session are expanded', async ($, on) => {
  const { sent, toasts } = world(on, { snippets: { fix: 'Fix the bug.' } })
  await $.prompt.submit({ text: 'please ;;fix now' } as never)
  expect(sent).toEqual(['please Fix the bug. now'])
  expect(toasts).toEqual([])
})

test('unknown names are kept and named in a toast', async ($, on) => {
  const { sent, toasts } = world(on, { snippets: { fix: 'F' } })
  await $.prompt.submit({ text: ';;fix ;;nope ;;zip' } as never)
  expect(sent).toEqual(['F ;;nope ;;zip'])
  expect(toasts).toEqual(['Unknown snippets: ;;nope, ;;zip'])
})

test('invalid names are refused and nothing is stored', async ($, on) => {
  world(on)
  expect((await run($, 'add Bad text')).text).toMatch(/Invalid name/)
  expect((await run($, 'list')).text).toBe('No snippets yet.')
})

test('prompts without tokens pass untouched', async ($, on) => {
  const { sent, toasts } = world(on, { snippets: { fix: 'F' } })
  await $.prompt.submit({ text: 'plain; text' } as never)
  expect(sent).toEqual(['plain; text'])
  expect(toasts).toEqual([])
})
