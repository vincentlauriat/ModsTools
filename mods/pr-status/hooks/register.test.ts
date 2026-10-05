import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const OPEN = JSON.stringify({
  number: 7,
  state: 'OPEN',
  isDraft: false,
  reviewDecision: 'APPROVED',
  mergeable: 'MERGEABLE',
  title: 'feat: example',
  url: 'https://github.com/example/repo/pull/7',
  statusCheckRollup: [{ __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' }],
})

type World = { statuses: (string | undefined)[]; runs: string[][]; clock: { now: number }; gh: { exitCode: number; stdout: string; throws: boolean } }

function world(on: On): World {
  const w: World = { statuses: [], runs: [], clock: { now: 0 }, gh: { exitCode: 0, stdout: OPEN, throws: false } }
  on('session.start', () => ({ cwd: '/proj' }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('clock.now', () => ({ value: w.clock.now }))
  on('command.register', () => ({ value: undefined as never }))
  on('ui.status', ($, e) => {
    w.statuses.push(e.text)
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    w.runs.push([...e.argv])
    if (w.gh.throws) throw new Error('gh not found')
    return { value: { exitCode: w.gh.exitCode, stdout: w.gh.stdout, stderr: '' } as never }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'ok' as never }))
  return w
}

const complete = (agentId?: string) => ({ answer: 'done', isAborted: false, turnId: 't', reason: 'answer', agentId }) as never

test('session.start shows the PR status, gh is asked in the session cwd', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/proj' } as never)
  expect(w.statuses.at(-1)).toBe('PR #7 ✓ checks · approved')
  expect(w.runs[0]?.slice(0, 3)).toEqual(['gh', 'pr', 'view'])
})

test('no PR, gh missing or a throwing run clear the status', async ($, on) => {
  const w = world(on)
  w.gh = { exitCode: 1, stdout: '', throws: false }
  await $.session.start({ cwd: '/proj' } as never)
  expect(w.statuses.at(-1)).toBeUndefined()
  w.gh = { exitCode: 0, stdout: OPEN, throws: true }
  await $.command.run({ command: 'pr-status', args: '' } as never)
  expect(w.statuses.at(-1)).toBeUndefined()
})

test('turn.complete refreshes at most every 5 minutes and skips subagents', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/proj' } as never)
  const before = w.runs.length
  w.clock.now = 60_000
  await $.turn.complete(complete())
  expect(w.runs.length).toBe(before)
  w.clock.now = 400_000
  await $.turn.complete(complete('sub-1'))
  expect(w.runs.length).toBe(before)
  await $.turn.complete(complete())
  expect(w.runs.length).toBe(before + 1)
})

test('gh pr create and git push refresh at once, other commands do not (test bites)', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/proj' } as never)
  const before = w.runs.length
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(w.runs.length).toBe(before)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  await $.tool.call({ tool: 'Bash', command: 'git push -u origin feat/x' })
  expect(w.runs.length).toBe(before + 2)
})

test('/pr-status prints the multi-line summary with failing check names', async ($, on) => {
  const w = world(on)
  w.gh.stdout = JSON.stringify({ ...JSON.parse(OPEN), statusCheckRollup: [{ __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE' }] })
  const out = await $.command.run({ command: 'pr-status', args: '' } as never)
  const text = 'text' in out ? out.text : ''
  expect(text).toContain('PR #7 ✗ 1 check · approved — feat: example')
  expect(text).toContain('✗ lint')
  expect(text).toContain('https://github.com/example/repo/pull/7')
})
