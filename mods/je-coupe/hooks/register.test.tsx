import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'je-coupe',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false } as never,
} as const

// A folder /proj holding `mtimes` (name -> mtimeMs); the session started at 1000.
function world(on: On, mtimes: Record<string, number>) {
  const sent: string[] = []
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.usage', () => ({ value: { startedAt: 1000 } as never }))
  on('fs.stat', ($, e) => {
    const mtimeMs = mtimes[e.path.replace('/proj/', '')]
    if (mtimeMs === undefined) throw new Error('ENOENT')
    return { value: { kind: 'file' as const, size: 1, mtimeMs, isLink: false } }
  })
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return sent
}

const done = (agentId?: string) => ({ answer: 'ok', isAborted: false, turnId: 't', reason: 'answer', agentId }) as never

async function submit($: Engine, text: string) {
  await $.prompt.submit({ text } as never)
}

test('appends an instruction listing existing docs, flagging untouched ones', async ($, on) => {
  const sent = world(on, { 'TODOS.md': 500, 'README.md': 2000 })
  await submit($, 'Je coupe !')
  const text = sent[0] ?? ''
  expect(text.startsWith('Je coupe !\n\n')).toBe(true)
  expect(text).toContain('TODOS.md (NOT modified this session), README.md.')
  expect(text).not.toContain('PLAN.md')
})

test('the band lists untouched docs and Dismiss hides it', async ($, on) => {
  world(on, { 'TODOS.md': 500, 'CHANGES.md': 10, 'README.md': 2000 })
  await submit($, 'je coupe')

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'Je coupe: 2 docs not updated yet: CHANGES.md, TODOS.md' })).toBeDefined()
  await ui.press({ key: 'dismiss' })
  expect(await ui.find({ type: 'Text', text: /Je coupe/ })).toBeUndefined()
  await ui.unmount()
})

test('the band disappears once a main turn finds every doc updated', async ($, on) => {
  const mtimes: Record<string, number> = { 'TODOS.md': 500, 'CHANGES.md': 10 }
  world(on, mtimes)
  await submit($, 'je coupe')

  mtimes['CHANGES.md'] = 3000
  await $.turn.complete(done('sub-1'))
  await $.turn.complete(done())
  let ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'Je coupe: 1 doc not updated yet: TODOS.md' })).toBeDefined()
  await ui.unmount()

  mtimes['TODOS.md'] = 3000
  await $.turn.complete(done())
  ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /Je coupe/ })).toBeUndefined()
  await ui.unmount()
})

test('a folder without any of the docs is left alone', async ($, on) => {
  const sent = world(on, {})
  await submit($, 'je coupe')
  expect(sent).toEqual(['je coupe'])
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /Je coupe/ })).toBeUndefined()
  await ui.unmount()
})

test('other prompts are not touched, a prompt starting with it is', async ($, on) => {
  const sent = world(on, { 'TODOS.md': 500 })
  await submit($, 'ne coupe pas, je coupe')
  await submit($, 'hello')
  await submit($, 'je coupe, merci')
  expect(sent[0]).toBe('ne coupe pas, je coupe')
  expect(sent[1]).toBe('hello')
  expect(sent[2]).toContain('TODOS.md (NOT modified this session).')
})
