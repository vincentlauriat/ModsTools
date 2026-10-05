import { expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PANE = {
  plugin: 'port-pane',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'port-pane',
  props: { title: 'Ports', isFocused: false, bodyColumns: 80, placement: 'dock' } as never,
} as const

type Proc = { command: string; login: string; ports: number[]; cwd: string }

const ran = (stdout: string, exitCode = 0): ProcessRunResult => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }) as ProcessRunResult

// Before the session: a desktop app (ControlCenter) and an old local server of the user, and another user's database.
function world(on: On) {
  const procs = new Map<number, Proc>([
    [837, { command: 'ControlCenter', login: 'dev', ports: [5000, 7000], cwd: '/' }],
    [1266, { command: 'Python', login: 'dev', ports: [8090], cwd: '/Users/dev/tools' }],
    [300, { command: 'postgres', login: 'other', ports: [5432], cwd: '/var/db' }],
  ])
  const w = {
    clock: mock.clock(on, { now: 0 }),
    procs,
    calls: [] as string[][],
    toasts: [] as string[],
    statuses: [] as (string | undefined)[],
    // Pids that ignore SIGTERM.
    stubborn: new Set<number>(),
    lsof: 'ok' as 'ok' | 'missing',
  }
  on('session.start', () => ({ cwd: '/Users/dev/app' }))
  on('command.register', () => ({ value: undefined as never }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    w.calls.push(argv)
    const line = argv.join(' ')
    if (line === 'id -un') return { value: ran('dev\n') }
    if (argv[0] === 'lsof') {
      if (w.lsof === 'missing') throw new Error('lsof: not found')
      if (line === 'lsof -nP -iTCP -sTCP:LISTEN -F pcnL') {
        const out: string[] = []
        for (const [pid, p] of procs) {
          out.push(`p${pid}`, `c${p.command.replace(/ /g, '\\x20')}`, `L${p.login}`)
          for (const port of p.ports) out.push('f10', `n127.0.0.1:${port}`, 'f11', `n[::1]:${port}`)
        }
        return { value: out.length === 0 ? ran('', 1) : ran(`${out.join('\n')}\n`) }
      }
      if (argv[1] === '-a') {
        const pids = argv[3]!.split(',').map(Number)
        return { value: ran(pids.flatMap(pid => (procs.has(pid) ? [`p${pid}`, 'fcwd', `n${procs.get(pid)!.cwd}`] : [])).join('\n')) }
      }
    }
    if (argv[0] === 'kill') {
      const pid = Number(argv.at(-1))
      if (!procs.has(pid)) return { value: ran('', 1) }
      if (argv[1] === '-0') return { value: ran('') }
      if (argv[1] === '-9' || !w.stubborn.has(pid)) procs.delete(pid)
      return { value: ran('') }
    }
    throw new Error(`unexpected ${line}`)
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }) as never)
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

const start = async ($: Engine, w: ReturnType<typeof world>) => {
  await $.session.start({ source: 'startup' } as never)
  await w.clock.advance(0)
}
const ports = ($: Engine, args = '') => $.command.run({ command: 'ports', args } as never) as Promise<{ text: string }>
const done = ($: Engine, agentId?: string) => $.turn.complete({ answer: 'done', isAborted: false, turnId: 't', reason: 'answer', agentId } as never)
const kills = (calls: string[][]) => calls.filter(c => c[0] === 'kill' && c[1] !== '-0').map(c => c.join(' '))
const lsofListings = (calls: string[][]) => calls.filter(c => c.join(' ') === 'lsof -nP -iTCP -sTCP:LISTEN -F pcnL').length

test('the pane lists the user’s listeners grouped by pid, marking ports opened during the session', async ($, on) => {
  const w = world(on)
  await start($, w)
  w.procs.set(4242, { command: 'node', login: 'dev', ports: [5173, 24678], cwd: '/Users/dev/app' })
  expect((await ports($)).text).toBe('Ports pane opened (3 listening processes · 1 new this session).')

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '● node · pid 4242 · :5173 :24678' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '/Users/dev/app' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Python · pid 1266 · :8090' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'ControlCenter · pid 837 · :5000 :7000' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'postgres · pid 300 · :5432' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'stop:4242', text: 'Stop' })).toBeDefined()
  // Older than the session: no Stop until allowed; a desktop app: never.
  expect(await ui.find({ type: 'Button', key: 'stop:1266' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'allow:1266', text: 'Allow stop' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'stop:837' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'allow:837' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'system or desktop app' })).toBeDefined()
  await ui.unmount()
})

test('Stop asks twice, sends SIGTERM (never -9) and refreshes once the process is gone (test bites)', async ($, on) => {
  const w = world(on)
  await start($, w)
  w.procs.set(4242, { command: 'node', login: 'dev', ports: [3000], cwd: '/Users/dev/app' })
  await ports($)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'stop:4242' })
  expect(kills(w.calls)).toEqual([])
  expect(await ui.find({ type: 'Button', key: 'stop:4242', text: 'Confirm stop?' })).toBeDefined()
  await ui.press({ key: 'stop:4242' })
  expect(kills(w.calls)).toEqual(['kill 4242'])
  expect(w.toasts).toEqual(['Sent SIGTERM to node (pid 4242)'])
  await w.clock.advance(3_000)
  expect(w.calls.filter(c => c[1] === '-0')).toEqual([['kill', '-0', '4242']])
  expect(await ui.find({ type: 'Text', text: '● node · pid 4242 · :3000' })).toBeUndefined()
  expect(kills(w.calls)).toEqual(['kill 4242'])
  await ui.unmount()
})

test('still alive after 3s: toast, then Force stop with its own two-step confirm sends kill -9 (test bites)', async ($, on) => {
  const w = world(on)
  await start($, w)
  w.procs.set(4242, { command: 'node', login: 'dev', ports: [3000], cwd: '/Users/dev/app' })
  w.stubborn.add(4242)
  await ports($)

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Button', key: 'force:4242' })).toBeUndefined()
  await ui.press({ key: 'stop:4242' })
  await ui.press({ key: 'stop:4242' })
  await w.clock.advance(3_000)
  expect(w.toasts.at(-1)).toBe('node (pid 4242) still running — Force stop is offered')
  expect(await ui.find({ type: 'Button', key: 'force:4242', text: 'Force stop' })).toBeDefined()
  await ui.press({ key: 'force:4242' })
  expect(kills(w.calls)).toEqual(['kill 4242'])
  expect(await ui.find({ type: 'Button', key: 'force:4242', text: 'Confirm kill -9?' })).toBeDefined()
  await ui.press({ key: 'force:4242' })
  expect(kills(w.calls)).toEqual(['kill 4242', 'kill -9 4242'])
  expect(w.toasts.at(-1)).toBe('Sent SIGKILL to node (pid 4242)')
  await w.clock.advance(1_000)
  expect(await ui.find({ type: 'Text', text: '● node · pid 4242 · :3000' })).toBeUndefined()
  await ui.unmount()
})

test('Allow stop unlocks a pre-session process; toggling it off locks it again', async ($, on) => {
  const w = world(on)
  await start($, w)
  await ports($)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'allow:1266' })
  expect(await ui.find({ type: 'Button', key: 'allow:1266', text: 'Allowed ✓' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'stop:1266', text: 'Stop' })).toBeDefined()
  await ui.press({ key: 'allow:1266' })
  expect(await ui.find({ type: 'Button', key: 'stop:1266' })).toBeUndefined()
  await ui.press({ key: 'allow:1266' })
  await ui.press({ key: 'stop:1266' })
  await ui.press({ key: 'stop:1266' })
  expect(kills(w.calls)).toEqual(['kill 1266'])
  await ui.unmount()
})

test('a pid that changed command between the two presses is not signalled', async ($, on) => {
  const w = world(on)
  await start($, w)
  w.procs.set(4242, { command: 'node', login: 'dev', ports: [3000], cwd: '/Users/dev/app' })
  await ports($)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'stop:4242' })
  w.procs.set(4242, { command: 'other', login: 'dev', ports: [3000], cwd: '/' })
  await ui.press({ key: 'stop:4242' })
  expect(kills(w.calls)).toEqual([])
  expect(w.toasts).toEqual(['pid 4242 is no longer listening'])
  await ui.unmount()
})

test('status line counts ports opened this session, refreshed deferred after main turns only', async ($, on) => {
  const w = world(on)
  await start($, w)
  expect(w.statuses.filter(s => s !== undefined)).toEqual([])
  w.procs.set(4242, { command: 'node', login: 'dev', ports: [5173, 24678], cwd: '/Users/dev/app' })
  w.procs.set(4300, { command: 'ruby', login: 'other', ports: [4000], cwd: '/' })
  const before = lsofListings(w.calls)
  await done($, 'agent-1')
  await w.clock.advance(0)
  expect(lsofListings(w.calls)).toBe(before)
  await done($)
  expect(lsofListings(w.calls)).toBe(before)
  await w.clock.advance(0)
  expect(lsofListings(w.calls)).toBe(before + 1)
  expect(w.statuses.at(-1)).toBe('🔌 2 dev ports')
  w.procs.delete(4242)
  await done($)
  await w.clock.advance(0)
  expect(w.statuses.at(-1)).toBeUndefined()
})

test('a second session.start (as on a hot reload) keeps the first baseline (test bites)', async ($, on) => {
  const w = world(on)
  await start($, w)
  w.procs.set(4242, { command: 'node', login: 'dev', ports: [3000], cwd: '/Users/dev/app' })
  await start($, w)
  expect((await ports($)).text).toBe('Ports pane opened (3 listening processes · 1 new this session).')
})

test('statusLine false: no status, no listing per turn', { options: { statusLine: false } }, async ($, on) => {
  const w = world(on)
  await start($, w)
  w.procs.set(4242, { command: 'node', login: 'dev', ports: [3000], cwd: '/Users/dev/app' })
  const before = lsofListings(w.calls)
  await done($)
  await w.clock.advance(0)
  expect(lsofListings(w.calls)).toBe(before)
  await ports($)
  expect(w.statuses).toEqual([])
})

test('without lsof the pane says so; refresh and close work', async ($, on) => {
  const w = world(on)
  w.lsof = 'missing'
  await start($, w)
  expect((await ports($, 'refresh')).text).toBe('lsof unavailable')
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'lsof unavailable' })).toBeDefined()
  await ui.unmount()
  expect((await ports($, 'close')).text).toBe('Ports pane closed.')
})
