import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const SHA2 = 'ffffeeee00001111222233334444555566667777'
const URL1 = 'https://github.com/owner/repo/actions/runs/101'
const URL2 = 'https://github.com/owner/repo/actions/runs/102'

type GhRun = { databaseId: number; name: string; workflowName: string; status: string; conclusion: string; url: string }

const running = (id: number, workflowName: string, url: string): GhRun => ({ databaseId: id, name: workflowName, workflowName, status: 'in_progress', conclusion: '', url })
const finished = (r: GhRun, conclusion: string): GhRun => ({ ...r, status: 'completed', conclusion })

function world(on: On) {
  const w = {
    clock: mock.clock(on, { now: 0 }),
    calls: [] as string[][],
    toasts: [] as string[],
    statuses: [] as (string | undefined)[],
    head: SHA,
    remoteUrl: 'git@github.com:owner/repo.git',
    gh: 'ok' as 'ok' | 'missing' | 'unauth',
    runs: new Map<string, GhRun[]>(),
    // When set, the next gh run list signals `reached` and waits for `gate` before answering: a slow poll.
    slow: null as null | { gate: Promise<void>; reached: () => void },
    bash: { isError: false, background: false },
  }
  mock.store(on)
  on('session.start', () => ({ cwd: '/work/repo' }))
  on('session.cwd', () => ({ value: '/work/repo' }))
  on('command.register', () => ({ value: undefined as never }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, ...(w.bash.background ? { backgroundTaskId: 'b1' } : {}) }, ...(w.bash.isError ? { isError: true } : {}) }) as never)
  on('process.run', async (_$, e) => {
    const argv = [...e.argv]
    w.calls.push(argv)
    const ok = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '' } as never })
    if (argv[0] === 'git') {
      const args = argv.slice(3).join(' ')
      if (args === 'rev-parse HEAD') return ok(`${w.head}\n`)
      if (args === 'rev-parse --abbrev-ref HEAD') return ok('feat/x\n')
      if (args.startsWith('config --get')) return ok('', 1)
      if (args === 'remote get-url --push origin') return ok(`${w.remoteUrl}\n`)
      throw new Error(`unexpected git ${args}`)
    }
    if (w.gh === 'missing') throw new Error('gh: not found')
    if (argv[1] === 'auth') return ok('', w.gh === 'unauth' ? 1 : 0)
    if (argv[1] === 'run') {
      const sha = argv[argv.indexOf('--commit') + 1]!
      const answer = JSON.stringify(w.runs.get(sha) ?? [])
      const slow = w.slow
      if (slow !== null) {
        w.slow = null
        slow.reached()
        await slow.gate
      }
      return ok(answer)
    }
    throw new Error(`unexpected ${argv.join(' ')}`)
  })
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    w.statuses.push(e.text)
    return { value: undefined }
  })
  return w
}

const bash = ($: Engine, command: string, agentId?: string) => $.tool.call({ tool: 'Bash', command, ...(agentId === undefined ? {} : { agentId }) } as never)
const command = async ($: Engine, args = '') => ((await $.command.run({ command: 'ci-watch', args } as never)) as { text: string }).text
const ghPolls = (calls: string[][]) => calls.filter(c => c[0] === 'gh' && c[1] === 'run')

test('the push result returns before any git or gh call; the work runs deferred (test bites)', async ($, on) => {
  const w = world(on)
  w.runs.set(SHA, [running(101, 'CI', URL1)])
  await bash($, 'rtk git push -u origin feat/x')
  expect(w.calls).toEqual([])
  await w.clock.advance(0)
  expect(w.calls[0]).toEqual(['git', '-C', '/work/repo', 'rev-parse', 'HEAD'])
  expect(ghPolls(w.calls)).toEqual([['gh', 'run', 'list', '-R', 'owner/repo', '--commit', SHA, '--json', 'databaseId,name,status,conclusion,url,workflowName']])
  expect(w.statuses.at(-1)).toBe('CI ⏳ 1 running')
})

test('polls every 30s, then toasts all passed, keeps the line 10 min and clears it', async ($, on) => {
  const w = world(on)
  const ci = running(101, 'CI', URL1)
  const lint = running(102, 'Lint', URL2)
  w.runs.set(SHA, [ci, lint])
  await bash($, 'cd sub && git push')
  await w.clock.advance(0)
  expect(w.calls[0]).toEqual(['git', '-C', '/work/repo/sub', 'rev-parse', 'HEAD'])
  expect(w.statuses.at(-1)).toBe('CI ⏳ 2 running')
  w.runs.set(SHA, [finished(ci, 'success'), lint])
  await w.clock.advance(30_000)
  expect(w.statuses.at(-1)).toBe('CI ⏳ 1 running')
  w.runs.set(SHA, [finished(ci, 'success'), finished(lint, 'skipped')])
  await w.clock.advance(30_000)
  expect(w.toasts).toEqual(['CI ✓ all 2 passed on feat/x'])
  expect(w.statuses.at(-1)).toBe('CI ✓ 2 passed')
  const polls = ghPolls(w.calls).length
  await w.clock.advance(9 * 60_000)
  expect(w.statuses.at(-1)).toBe('CI ✓ 2 passed')
  await w.clock.advance(60_000)
  expect(w.statuses.at(-1)).toBeUndefined()
  expect(ghPolls(w.calls).length).toBe(polls)
})

test('a failure toasts the failed workflow names and the first failed run URL', async ($, on) => {
  const w = world(on)
  w.runs.set(SHA, [finished(running(101, 'CI', URL1), 'success'), finished(running(102, 'Lint', URL2), 'failure')])
  await bash($, 'git push')
  await w.clock.advance(0)
  expect(w.statuses.at(-1)).toBe('CI ✗ 1 failed')
  expect(w.toasts).toEqual([`CI ✗ failed on feat/x: Lint — ${URL2}`])
  const text = await command($)
  expect(text).toContain(`owner/repo · feat/x @ a1b2c3d · done`)
  expect(text).toContain(`✗ Lint (failure) ${URL2}`)
  expect(text).toContain(`✓ CI (success) ${URL1}`)
})

test('no run within 2 min: gives up silently (test bites)', async ($, on) => {
  const w = world(on)
  await bash($, 'git push')
  await w.clock.advance(0)
  await w.clock.advance(90_000)
  expect(ghPolls(w.calls).length).toBe(4)
  await w.clock.advance(30_000)
  const polls = ghPolls(w.calls).length
  await w.clock.advance(10 * 60_000)
  expect(ghPolls(w.calls).length).toBe(polls)
  expect(w.toasts).toEqual([])
  expect(w.statuses.filter(s => s !== undefined)).toEqual([])
  expect(await command($)).toContain('no workflow run for a1b2c3d after 2 min')
})

test('a run showing up after a few polls is followed', async ($, on) => {
  const w = world(on)
  await bash($, 'git push')
  await w.clock.advance(60_000)
  w.runs.set(SHA, [running(101, 'CI', URL1)])
  await w.clock.advance(30_000)
  expect(w.statuses.at(-1)).toBe('CI ⏳ 1 running')
})

test('stops after 45 min with a toast', async ($, on) => {
  const w = world(on)
  w.runs.set(SHA, [running(101, 'CI', URL1)])
  await bash($, 'git push')
  await w.clock.advance(0)
  await w.clock.advance(45 * 60_000)
  expect(w.toasts).toEqual(['CI: stopped watching a1b2c3d after 45 min'])
  expect(w.statuses.at(-1)).toBeUndefined()
  const polls = ghPolls(w.calls).length
  await w.clock.advance(10 * 60_000)
  expect(ghPolls(w.calls).length).toBe(polls)
})

test('a new push replaces the watch; a slow poll of the old sha writes nothing (test bites)', async ($, on) => {
  const w = world(on)
  w.runs.set(SHA, [running(101, 'Old', URL1)])
  await bash($, 'git push')
  await w.clock.advance(0)
  expect(w.statuses.at(-1)).toBe('CI ⏳ 1 running')
  // The next poll of the old sha hangs while the new push lands.
  w.runs.set(SHA, [finished(running(101, 'Old', URL1), 'failure')])
  let release = () => undefined as void
  let reached = () => undefined as void
  const gate = new Promise<void>(resolve => (release = resolve))
  const inFlight = new Promise<void>(resolve => (reached = resolve))
  w.slow = { gate, reached }
  const slow = w.clock.advance(30_000)
  await inFlight
  w.head = SHA2
  w.runs.set(SHA2, [running(201, 'New', URL2), running(202, 'New2', URL2)])
  await bash($, 'git push')
  await w.clock.advance(0)
  expect(w.statuses.at(-1)).toBe('CI ⏳ 2 running')
  release()
  await slow
  // Let the released poll finish its work.
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
  await w.clock.advance(1)
  expect(w.toasts).toEqual([])
  expect(w.statuses.at(-1)).toBe('CI ⏳ 2 running')
  await w.clock.advance(30_000)
  expect(ghPolls(w.calls).at(-1)).toContain(SHA2)
})

test('the same sha pushed again keeps one watch', async ($, on) => {
  const w = world(on)
  w.runs.set(SHA, [running(101, 'CI', URL1)])
  await bash($, 'git push')
  await w.clock.advance(0)
  await bash($, 'git push origin HEAD:other')
  await w.clock.advance(0)
  expect(ghPolls(w.calls).length).toBe(1)
  await w.clock.advance(30_000)
  expect(ghPolls(w.calls).length).toBe(2)
})

test('subagents, failed, backgrounded and non-push commands are ignored', async ($, on) => {
  const w = world(on)
  await bash($, 'git push', 'agent-1')
  await bash($, 'echo "git push"')
  await bash($, 'git push --dry-run')
  w.bash = { isError: true, background: false }
  await bash($, 'git push')
  w.bash = { isError: false, background: true }
  await bash($, 'git push')
  await w.clock.advance(60_000)
  expect(w.calls).toEqual([])
  expect(await command($)).toBe('No push watched this session.')
})

test('gh missing, not authenticated or a non-GitHub remote: nothing shown, /ci-watch says why', async ($, on) => {
  const w = world(on)
  w.gh = 'missing'
  await bash($, 'git push')
  await w.clock.advance(0)
  expect(await command($)).toBe('Note: gh is not installed (or did not answer).')
  w.gh = 'unauth'
  await bash($, 'git push')
  await w.clock.advance(0)
  expect(await command($)).toBe('Note: gh is not authenticated (gh auth login).')
  w.gh = 'ok'
  w.remoteUrl = 'https://gitlab.com/owner/repo.git'
  await bash($, 'git push')
  await w.clock.advance(60_000)
  expect(await command($)).toBe('Note: remote origin is not a GitHub repository.')
  expect(ghPolls(w.calls)).toEqual([])
  expect(w.statuses).toEqual([])
  expect(w.toasts).toEqual([])
})

test('/ci-watch stop ends polling; off ignores pushes until on', async ($, on) => {
  const w = world(on)
  w.runs.set(SHA, [running(101, 'CI', URL1)])
  await bash($, 'git push')
  await w.clock.advance(0)
  expect(await command($, 'stop')).toBe('Stopped watching CI.')
  expect(w.statuses.at(-1)).toBeUndefined()
  const polls = ghPolls(w.calls).length
  await w.clock.advance(5 * 60_000)
  expect(ghPolls(w.calls).length).toBe(polls)

  expect(await command($, 'off')).toBe('ci-watch off: pushes are no longer followed.')
  w.head = SHA2
  await bash($, 'git push')
  await w.clock.advance(60_000)
  expect(ghPolls(w.calls).length).toBe(polls)
  expect(await command($)).toContain('ci-watch is off')

  await command($, 'on')
  w.runs.set(SHA2, [running(201, 'CI', URL2)])
  await bash($, 'git push')
  await w.clock.advance(0)
  expect(ghPolls(w.calls).at(-1)).toContain(SHA2)
})
