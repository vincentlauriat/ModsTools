import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const INPUT = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never

type Files = Record<string, string>

function world(on: On, files: Files) {
  const reads: string[] = []
  mock.store(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'Hello', scope: 'shared' as const }] }))
  on('session.start', (_$, e) => e as never)
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined as never }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.read', (_$, e) => {
    const name = String((e as { path: string }).path).replace('/proj/', '')
    reads.push(name)
    const content = files[name]
    if (content === undefined) throw new Error('ENOENT')
    return { value: content }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  return { reads, files }
}

async function sections($: Engine) {
  const { sections } = await $.prompt.compose(INPUT)
  return sections.filter(s => s.id === 'resume-brief:session')
}

const TURN = { answer: 'hi', durationMs: 1, isAborted: false, turnId: 't' } as never

test('session.start adds one last session section built from the journals', async ($, on) => {
  world(on, { 'COMMANDS.md': '## 1 — 2026-01-01\nreprends\n', 'PLAN.md': '## Phase 2 🟡\n- 🟡 doing\n' })
  await $.session.start({ cwd: '/proj' } as never)
  const found = await sections($)
  expect(found).toHaveLength(1)
  expect(found[0]?.scope).toBe('session')
  expect(found[0]?.text).toContain('#1 2026-01-01: reprends')
  expect(found[0]?.text).toContain('Phase 2 🟡')
  const all = (await $.prompt.compose(INPUT)).sections
  expect(all[all.length - 1]?.id).toBe('resume-brief:session')
})

test('compose reads only the cache; turn.complete refreshes it', async ($, on) => {
  const w = world(on, { 'CHANGES.md': 'first change\n' })
  await $.session.start({ cwd: '/proj' } as never)
  const afterStart = w.reads.length
  await $.prompt.compose(INPUT)
  await $.prompt.compose(INPUT)
  expect(w.reads.length).toBe(afterStart)
  w.files['CHANGES.md'] = 'first change\nsecond change\n'
  await $.turn.complete(TURN)
  expect(w.reads.length).toBeGreaterThan(afterStart)
  expect((await sections($))[0]?.text).toContain('second change')
})

test('no journal files: no section and a clear command answer', async ($, on) => {
  world(on, {})
  await $.session.start({ cwd: '/proj' } as never)
  expect(await sections($)).toHaveLength(0)
  expect((await $.command.run({ command: 'resume-brief', args: '' } as never)).text).toContain('Nothing to brief')
})

test('/resume-brief shows, off removes the section, on restores it', async ($, on) => {
  world(on, { 'MEMORY.md': '## State\n- shipped it\n' })
  await $.session.start({ cwd: '/proj' } as never)
  expect((await $.command.run({ command: 'resume-brief', args: '' } as never)).text).toContain('- shipped it')
  await $.command.run({ command: 'resume-brief', args: 'off' } as never)
  expect(await sections($)).toHaveLength(0)
  expect((await $.command.run({ command: 'resume-brief', args: '' } as never)).text).toBe('resume-brief is off.')
  await $.command.run({ command: 'resume-brief', args: 'on' } as never)
  expect(await sections($)).toHaveLength(1)
})
