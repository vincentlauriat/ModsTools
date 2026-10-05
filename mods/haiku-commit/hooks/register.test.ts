import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

const res = (exitCode: number, stdout = ''): ProcessRunResult => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

const OLD = '1111111111111111111111111111111111111111'
const NEW = 'abcdef0123456789abcdef0123456789abcdef01'
const SHOW = `${NEW}\nfeat(ui): add pane\n\n12\t3\tsrc/pane.ts\n4\t0\tsrc/util.ts\n`

type World = {
  head: string
  failTool: boolean
  model: 'ok' | 'bad' | 'none' | 'throw'
  toasts: string[]
  dirs: string[]
  modelCalls: number
  processThrows: boolean
  // When set, the model answers only once the test calls `release()`.
  hold: boolean
  release: () => void
  clock: MockClock
}

let current: MockClock | undefined
const clockOf = (_$: Engine) => current!

// A fake repo: the Bash tool "commits" (moves HEAD to NEW) unless it fails.
function world(on: On, w: Partial<World> = {}): World {
  const s: World = { head: OLD, failTool: false, model: 'ok', toasts: [], dirs: [], modelCalls: 0, processThrows: false, hold: false, release: () => {}, clock: undefined as never, ...w }
  mock.store(on)
  s.clock = mock.clock(on, { now: 0 })
  current = s.clock
  on('command.register', () => ({ value: undefined as never }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('tool.call', () => {
    if (s.failTool) return { result: { stdout: '', stderr: '' }, isError: true, text: 'exit 1' } as never
    s.head = NEW

    return { result: { stdout: '', stderr: '' } } as never
  })
  on('process.run', (_$, e) => {
    if (s.processThrows) throw new Error('cannot start git')
    s.dirs.push(String(e.argv[2]))
    const sub = e.argv.slice(3).join(' ')
    if (sub === 'rev-parse --verify -q HEAD') return { value: res(0, `${s.head}\n`) }
    if (sub.startsWith('show --numstat')) return { value: res(0, s.head === NEW ? SHOW : `${OLD}\nchore: old\n`) }

    return { value: res(1) }
  })
  on('model.complete', async () => {
    s.modelCalls += 1
    if (s.hold) await new Promise<void>(resolve => (s.release = resolve))
    if (s.model === 'throw') throw new Error('model blocked')
    const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    if (s.model === 'none') return { value: { isAnswered: false, reason: 'aborted', usage } as never }
    const text = s.model === 'ok' ? 'Panes slide open wide\nA new window on the code\nThe morning light in' : 'Sure! Here is a haiku for you.'

    return { value: { isAnswered: true, text, usage } as never }
  })
  on('ui.toast', (_$, e) => {
    s.toasts.push(e.text)

    return { value: undefined as never }
  })

  return s
}

const call = ($: Engine, command: string, agentId?: string) => $.tool.call({ tool: 'Bash', command, ...(agentId === undefined ? {} : { agentId }) } as never)

// Runs the command, then lets the deferred haiku work finish.
async function bash($: Engine, command: string, agentId?: string) {
  const r = await call($, command, agentId)
  await clockOf($).settle()

  return r
}
const cmd = async ($: Engine, args = '') => (await $.command.run({ command: 'haiku-commit', args } as never)).text ?? ''

test('a successful commit toasts the model haiku and /haiku-commit shows it again', async ($, on) => {
  const s = world(on)
  await bash($, 'git add . && git commit -m "feat(ui): add pane"')
  expect(s.toasts).toEqual(['Panes slide open wide\nA new window on the code\nThe morning light in'])
  const text = await cmd($)
  expect(text).toContain('A new window on the code')
  expect(text).toContain('abcdef0 feat(ui): add pane (written by a model)')
})

for (const model of ['bad', 'none', 'throw'] as const) {
  test(`a model reply that is ${model} falls back to a template haiku`, async ($, on) => {
    const s = world(on, { model })
    await bash($, 'git commit -m "feat(ui): add pane"')
    expect(s.toasts).toHaveLength(1)
    expect(s.toasts[0]!.split('\n')).toHaveLength(3)
    expect(await cmd($)).toContain('(from templates)')
  })
}

test('rtk, env, cd and git -C prefixes run git in the commit folder', async ($, on) => {
  const s = world(on)
  await bash($, 'cd app && FOO=1 rtk git -C sub commit -m "fix: x"')
  expect(s.dirs.every(d => d === '/proj/app/sub')).toBe(true)
  expect(s.toasts).toHaveLength(1)
})

test('no toast when the command failed, HEAD did not move, a subagent ran it, or it is not a commit', async ($, on) => {
  const s = world(on, { failTool: true })
  await bash($, 'git commit -m "feat: a"')
  s.failTool = false
  await bash($, 'git commit -m "feat: a"', 'sub')
  await bash($, 'git status')
  await bash($, 'echo commit')
  expect(s.toasts).toEqual([])
  expect(s.modelCalls).toBe(0)
  s.head = NEW
  await bash($, 'git commit --amend --no-edit || true')
  expect(s.toasts).toEqual([])
})

test('git that cannot start is caught and the tool result still returns', async ($, on) => {
  const s = world(on, { processThrows: true })
  const r = await bash($, 'git commit -m "feat: a"')
  expect('result' in r).toBe(true)
  expect(s.toasts).toEqual([])
})

test('/haiku-commit off silences it, on brings it back; usage on bad args', async ($, on) => {
  const s = world(on)
  expect(await cmd($)).toContain('No commit haiku yet.')
  expect(await cmd($, 'off')).toBe('haiku-commit is OFF.')
  await bash($, 'git commit -m "feat: a"')
  expect(s.toasts).toEqual([])
  expect(await cmd($, 'on')).toBe('haiku-commit is ON.')
  s.head = OLD
  await bash($, 'git commit -m "feat: a"')
  expect(s.toasts).toHaveLength(1)
  expect(await cmd($, 'bogus')).toContain('Usage')
})

test('the Bash result comes back before the model answers; the toast follows', { timeoutMs: 20_000 }, async ($, on) => {
  const s = world(on, { hold: true })
  let returned = false
  const pending = call($, 'git commit -m "feat(ui): add pane"').then(r => {
    returned = true

    return r
  })
  await s.clock.settle()
  expect(s.modelCalls).toBe(1)
  expect(returned).toBe(true)
  expect(s.toasts).toEqual([])
  s.release()
  await pending
  await s.clock.settle()
  expect(s.toasts).toHaveLength(1)
})
