import { expect, test } from 'claude-code/testing'
import type { ProcessRunResult } from 'claude-code'

const PANE = {
  component: 'Pane',
  requestId: 'diff-preview',
  props: { title: 'Diff', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
} as const

const ok = (stdout: string): ProcessRunResult => ({
  exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
})

const complete = (agentId?: string) => ({
  answer: 'done', isAborted: false, turnId: 't', reason: 'answer', agentId,
}) as never

// A fake git whose answers a test can change; `runs` records each argv and its cwd.
function fakeGit() {
  const git = {
    stat: ' src/a.ts | 3 ++-\n 1 file changed, 2 insertions(+), 1 deletion(-)\n',
    porcelain: ' M src/a.ts\n?? new.ts\n',
    code: 0,
    runs: [] as string[],
  }
  const answer = (argv: readonly string[], cwd?: string): ProcessRunResult => {
    git.runs.push(`${cwd}:${argv.slice(1).join(' ')}`)
    if (git.code !== 0) return { ...ok(''), exitCode: git.code }
    return ok(argv[1] === 'diff' ? git.stat : git.porcelain)
  }
  return { git, answer }
}

test('/diff-preview shows the stat and the untracked count', async ($, on) => {
  const { git, answer } = fakeGit()
  on('session.cwd', () => ({ value: '/proj' }))
  on('process.run', ($e, e) => ({ value: answer(e.argv, e.init?.cwd) }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const ran = await $.command.run({ command: 'diff-preview', args: '' } as never)
  expect('text' in ran ? ran.text : '').toContain('1 untracked file')
  expect(git.runs).toEqual(['/proj:diff --stat', '/proj:status --porcelain'])

  const ui = await $.ui.mount({ plugin: 'diff-preview', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'src/a.ts | 3 ++-' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 file changed, 2 insertions(+), 1 deletion(-)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 untracked file' })).toBeDefined()
  await ui.unmount()
})

test('outside a git repository the pane says so', async ($, on) => {
  const { git, answer } = fakeGit()
  git.code = 128
  on('session.cwd', () => ({ value: '/tmp' }))
  on('process.run', ($e, e) => ({ value: answer(e.argv, e.init?.cwd) }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const ran = await $.command.run({ command: 'diff-preview', args: 'refresh' } as never)
  expect('text' in ran ? ran.text : '').toBe('not a git repository')

  const ui = await $.ui.mount({ plugin: 'diff-preview', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'not a git repository' })).toBeDefined()
  await ui.unmount()
})

test('a git that cannot start is reported, not thrown', async ($, on) => {
  on('session.cwd', () => ({ value: '/proj' }))
  on('process.run', () => {
    throw new Error('spawn failed')
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const ran = await $.command.run({ command: 'diff-preview', args: '' } as never)
  expect('text' in ran ? ran.text : '').toBe('git unavailable')
})

test('the pane refreshes after a main turn but not after a subagent turn', async ($, on) => {
  const { git, answer } = fakeGit()
  on('session.cwd', () => ({ value: '/proj' }))
  on('process.run', ($e, e) => ({ value: answer(e.argv, e.init?.cwd) }))
  on('turn.complete', ($e, e) => ({ text: e.answer }))

  await $.turn.complete(complete('sub-1'))
  expect(git.runs).toEqual([])

  git.stat = ' b.ts | 1 +\n 1 file changed, 1 insertion(+)\n'
  await $.turn.complete(complete())
  expect(git.runs).toHaveLength(2)

  const ui = await $.ui.mount({ plugin: 'diff-preview', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'b.ts | 1 +' })).toBeDefined()
  await ui.unmount()
})
