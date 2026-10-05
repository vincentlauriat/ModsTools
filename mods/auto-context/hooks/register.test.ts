import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const INPUT = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never
const STATUS = '# branch.head main\n# branch.ab +1 -0\n? a.ts\n'

function world(on: On, opts: { repo: boolean; todos: string | null }) {
  const runs: string[][] = []
  mock.store(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'Hello', scope: 'shared' as const }] }))
  on('session.start', (_$, e) => e as never)
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined as never }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('process.run', (_$, e) => {
    const cmd = e.argv
    runs.push([...cmd])
    if (!opts.repo) return { value: { exitCode: 128, stdout: '', stderr: 'not a repo' } as never }
    return { value: { exitCode: 0, stdout: cmd[1] === 'status' ? STATUS : 'last subject\n', stderr: '' } as never }
  })
  on('fs.read', () => {
    if (opts.todos === null) throw new Error('ENOENT')
    return { value: opts.todos }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  return runs
}

async function sections($: Engine) {
  const { sections } = await $.prompt.compose(INPUT)
  return sections.filter(s => s.id === 'auto-context:session')
}

test('session.start adds one last session section with git and todos', async ($, on) => {
  world(on, { repo: true, todos: '## Next\n- [ ] ship it\n' })
  await $.session.start({ cwd: '/proj' } as never)
  const found = await sections($)
  expect(found).toHaveLength(1)
  expect(found[0]?.scope).toBe('session')
  expect(found[0]?.text).toContain('Git branch: main (ahead 1)')
  expect(found[0]?.text).toContain('Last commit: last subject')
  expect(found[0]?.text).toContain('- [ ] ship it')
  const all = (await $.prompt.compose(INPUT)).sections
  expect(all[all.length - 1]?.id).toBe('auto-context:session')
})

test('compose does not run git; only session.start and turn.complete do', async ($, on) => {
  const runs = world(on, { repo: true, todos: null })
  await $.session.start({ cwd: '/proj' } as never)
  const afterStart = runs.length
  await $.prompt.compose(INPUT)
  await $.prompt.compose(INPUT)
  expect(runs.length).toBe(afterStart)
  await $.turn.complete({ answer: 'hi', durationMs: 1, isAborted: false, turnId: 't' } as never)
  expect(runs.length).toBeGreaterThan(afterStart)
})

test('not a repo: only the TODOS part; nothing at all: no section', async ($, on) => {
  world(on, { repo: false, todos: '- [ ] solo\n' })
  await $.session.start({ cwd: '/proj' } as never)
  const found = await sections($)
  expect(found[0]?.text).toContain('- [ ] solo')
  expect(found[0]?.text).not.toContain('Git')
})

test('nothing to inject: no section', async ($, on) => {
  world(on, { repo: false, todos: null })
  await $.session.start({ cwd: '/proj' } as never)
  expect(await sections($)).toHaveLength(0)
  const r = await $.command.run({ command: 'auto-context', args: '' } as never)
  expect(r.text).toContain('Nothing to inject')
})

test('/auto-context shows, off removes the section, on restores it', async ($, on) => {
  world(on, { repo: true, todos: null })
  await $.session.start({ cwd: '/proj' } as never)
  expect((await $.command.run({ command: 'auto-context', args: '' } as never)).text).toContain('Git branch: main')
  await $.command.run({ command: 'auto-context', args: 'off' } as never)
  expect(await sections($)).toHaveLength(0)
  expect((await $.command.run({ command: 'auto-context', args: '' } as never)).text).toBe('auto-context is off.')
  await $.command.run({ command: 'auto-context', args: 'on' } as never)
  expect(await sections($)).toHaveLength(1)
})
