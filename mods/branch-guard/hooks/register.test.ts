import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

let engine: 'allow' | 'ask' | 'deny' = 'allow'

const res = (exitCode: number, stdout = ''): ProcessRunResult => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

type World = { branch: string; ignored: boolean; inRepo: boolean; headReads: number; now: number; ran: number }

// Fake git: repo root /repo, current branch `branch`.
function world(on: On, w: Partial<World> = {}): World {
  const state: World = { branch: 'main', ignored: false, inRepo: true, headReads: 0, now: 0, ran: 0, ...w }
  on('tool.check', () => ({ decision: engine }))
  on('tool.call', () => {
    state.ran += 1
    return { result: 'ok' as never }
  })
  on('fs.exists', () => ({ value: true }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('clock.now', () => ({ value: state.now }))
  on('process.run', (_$, e) => {
    const sub = e.argv.slice(3).join(' ')
    if (!state.inRepo) return { value: res(128) }
    if (sub === 'rev-parse --show-toplevel') return { value: res(0, '/repo\n') }
    if (sub === 'rev-parse --abbrev-ref HEAD') {
      state.headReads += 1
      return { value: res(0, `${state.branch}\n`) }
    }
    if (sub.startsWith('check-ignore')) return { value: res(state.ignored ? 0 : 1) }
    return { value: res(1) }
  })

  return state
}

const verdict = ($: Engine, tool: string, input: object) => $.tool.check({ tool, input } as never)

test('editing on main asks, on a feature branch or outside a repo it does not', async ($, on) => {
  engine = 'allow'
  const w = world(on)

  const asked = await verdict($, 'Edit', { file_path: '/repo/src/a.ts' })
  expect(asked.decision).toBe('ask')
  expect(asked.reason).toContain('branch-guard')
  expect((await verdict($, 'Write', { file_path: '/repo/new/dir/b.ts' })).decision).toBe('ask')
  expect((await verdict($, 'NotebookEdit', { notebook_path: '/repo/n.ipynb' })).decision).toBe('ask')
  expect((await verdict($, 'Read', { file_path: '/repo/a.ts' })).decision).toBe('allow')

  w.branch = 'feat/x'
  w.now = 60_000
  expect((await verdict($, 'Edit', { file_path: '/repo/src/a.ts' })).decision).toBe('allow')

  w.inRepo = false
  expect((await verdict($, 'Edit', { file_path: '/tmp/free/a.ts' })).decision).toBe('allow')
})

test('master is protected too, and a gitignored file is not asked', async ($, on) => {
  engine = 'allow'
  const w = world(on, { branch: 'master' })

  expect((await verdict($, 'Edit', { file_path: '/repo/a.ts' })).decision).toBe('ask')
  w.ignored = true
  expect((await verdict($, 'Edit', { file_path: '/repo/dist/out.js' })).decision).toBe('allow')
})

test('it asks once per repo: after an allowed edit ran, the repo is allowed', async ($, on) => {
  engine = 'allow'
  const w = world(on)

  expect((await verdict($, 'Edit', { file_path: '/repo/a.ts' })).decision).toBe('ask')
  await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts' } as never)
  expect(w.ran).toBe(1)
  expect((await verdict($, 'Edit', { file_path: '/repo/b.ts' })).decision).toBe('allow')
  expect((await verdict($, 'Write', { file_path: '/repo/c.ts' })).decision).toBe('allow')
})

test('a refused edit (no tool call) keeps asking', async ($, on) => {
  engine = 'allow'
  world(on)

  expect((await verdict($, 'Edit', { file_path: '/repo/a.ts' })).decision).toBe('ask')
  expect((await verdict($, 'Edit', { file_path: '/repo/a.ts' })).decision).toBe('ask')
  await $.tool.call({ tool: 'Edit', file_path: '/repo/other.ts' } as never)
  expect((await verdict($, 'Edit', { file_path: '/repo/a.ts' })).decision).toBe('ask')
})

test('the branch is cached for 30 seconds per repo', async ($, on) => {
  engine = 'allow'
  const w = world(on)

  await verdict($, 'Edit', { file_path: '/repo/a.ts' })
  w.now = 29_000
  await verdict($, 'Edit', { file_path: '/repo/a.ts' })
  expect(w.headReads).toBe(1)
  w.now = 31_000
  await verdict($, 'Edit', { file_path: '/repo/a.ts' })
  expect(w.headReads).toBe(2)
})

test('protectedBranches option replaces the default list', { options: { protectedBranches: 'develop, release' } }, async ($, on) => {
  engine = 'allow'
  const w = world(on, { branch: 'main' })

  expect((await verdict($, 'Edit', { file_path: '/repo/a.ts' })).decision).toBe('allow')
  w.branch = 'develop'
  w.now = 60_000
  expect((await verdict($, 'Edit', { file_path: '/repo/a.ts' })).decision).toBe('ask')
})

test('an engine deny is never weakened', async ($, on) => {
  engine = 'deny'
  world(on)

  expect((await verdict($, 'Edit', { file_path: '/repo/a.ts' })).decision).toBe('deny')
})

test('/branch-guard off stops asking, on asks again, status reports', async ($, on) => {
  engine = 'allow'
  world(on)

  const off = await $.command.run({ command: 'branch-guard', args: 'off' } as never)
  expect('text' in off ? off.text : '').toContain('OFF')
  expect((await verdict($, 'Edit', { file_path: '/repo/a.ts' })).decision).toBe('allow')

  await $.command.run({ command: 'branch-guard', args: 'on' } as never)
  expect((await verdict($, 'Edit', { file_path: '/repo/a.ts' })).decision).toBe('ask')
  const status = await $.command.run({ command: 'branch-guard', args: 'status' } as never)
  expect('text' in status ? status.text : '').toContain('ON')
})
