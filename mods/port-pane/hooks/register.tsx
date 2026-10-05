import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PortRow } from '../types'
import { UNAVAILABLE, canStop, countLabel, keysOf, newPortCount, parseCwds, parseListeners, rowLabel, statusText, toRows } from './ports'
import type { Listener } from './ports'

const PANE = 'port-pane'
const TITLE = 'Ports'
const LSOF_MS = 5_000
const KILL_MS = 5_000
const GRACE_MS = 3_000
const LISTEN = ['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcnL']

const rows = atom({ plugin: 'port-pane', key: 'rows' } as const, [])
const error = atom({ plugin: 'port-pane', key: 'error' } as const, null)
const confirm = atom({ plugin: 'port-pane', key: 'confirm' } as const, null)
const notice = atom({ plugin: 'port-pane', key: 'notice' } as const, null)
const baseline = atom({ plugin: 'port-pane', key: 'baseline' } as const, null)
const allowed = atom({ plugin: 'port-pane', key: 'allowed' } as const, [])
const stubborn = atom({ plugin: 'port-pane', key: 'stubborn' } as const, [])

type Ctx = {
  showStatus: boolean
  // The login lsof's L field is compared with: undefined until asked, null when `id -un` failed.
  user: string | null | undefined
  cwds: Map<number, string>
  busy: boolean
}

type Ran = { exitCode: number; stdout: string } | null

async function run($: EngineInterface, argv: string[], timeoutMs: number): Promise<Ran> {
  try {
    const ran = await $.process.run(argv, { timeoutMs })
    return { exitCode: ran.exitCode, stdout: ran.stdout }
  } catch {
    return null
  }
}

async function whoami($: EngineInterface, ctx: Ctx): Promise<string | null> {
  if (ctx.user === undefined) {
    const ran = await run($, ['id', '-un'], LSOF_MS)
    ctx.user = ran !== null && ran.exitCode === 0 && ran.stdout.trim() !== '' ? ran.stdout.trim() : null
  }

  return ctx.user
}

// The listeners, or null when lsof cannot run. lsof exits 1 when nothing listens.
async function listen($: EngineInterface): Promise<Listener[] | null> {
  const ran = await run($, LISTEN, LSOF_MS)
  if (ran === null) return null
  // Exit 1 also covers a partial listing (a process gone mid-scan): the fields printed still count.
  if (ran.exitCode !== 0 && ran.exitCode !== 1) return null

  return parseListeners(ran.stdout)
}

async function fetchCwds($: EngineInterface, ctx: Ctx, pids: number[]) {
  if (pids.length === 0) return
  const ran = await run($, ['lsof', '-a', '-p', pids.join(','), '-d', 'cwd', '-F', 'n'], LSOF_MS)
  if (ran === null) return
  for (const [pid, cwd] of parseCwds(ran.stdout)) ctx.cwds.set(pid, cwd)
}

// One listing: rows, error and (when enabled) the status line. The first listing of the session is the baseline.
async function sync($: EngineInterface, ctx: Ctx, withCwd: boolean): Promise<PortRow[] | null> {
  const listeners = await listen($)
  if (listeners === null) {
    await update($, error, () => UNAVAILABLE)
    return null
  }
  const user = await whoami($, ctx)
  const mine = user === null ? listeners : listeners.filter(one => one.login === user)
  let known = await read($, baseline)
  if (known === null) {
    known = mine.flatMap(keysOf)
    await update($, baseline, () => known)
  }
  if (withCwd) await fetchCwds($, ctx, mine.map(one => one.pid))
  const list = toRows(mine, known, ctx.cwds)
  await update($, rows, () => list)
  await update($, error, () => null)
  if (ctx.showStatus) $.ui.status(statusText(newPortCount(list, user)))

  return list
}

async function refresh($: EngineInterface, ctx: Ctx, message: string | null = null): Promise<PortRow[] | null> {
  const list = await sync($, ctx, true)
  await update($, confirm, () => null)
  await update($, notice, () => message)

  return list
}

// A deferred status refresh after a main turn; one at a time.
async function background($: EngineInterface, ctx: Ctx) {
  if (ctx.busy) return
  ctx.busy = true
  try {
    await sync($, ctx, false)
  } finally {
    ctx.busy = false
  }
}

async function say($: EngineInterface, message: string) {
  await update($, notice, () => message)
  $.ui.toast(message)
}

async function checkAlive($: EngineInterface, ctx: Ctx, pid: number, command: string) {
  const ran = await run($, ['kill', '-0', String(pid)], KILL_MS)
  if (ran !== null && ran.exitCode === 0) {
    await update($, stubborn, list => (list.includes(pid) ? list : [...list, pid]))
    await say($, `${command} (pid ${pid}) still running — Force stop is offered`)
    return
  }
  await update($, stubborn, list => list.filter(one => one !== pid))
  await sync($, ctx, false)
}

// The second press of Stop or Force stop: the pid is checked again against a fresh listing before any signal.
async function signal($: EngineInterface, ctx: Ctx, kind: 'stop' | 'force', pid: number) {
  const before = (await read($, rows)).find(row => row.pid === pid)
  const list = await sync($, ctx, false)
  const row = list?.find(one => one.pid === pid)
  if (before === undefined || row === undefined || row.command !== before.command) {
    await say($, `pid ${pid} is no longer listening`)
    return
  }
  const verdict = canStop(row, await whoami($, ctx), await read($, allowed))
  if (!verdict.ok) {
    await say($, `Refused to stop ${row.command} (pid ${pid}): ${verdict.reason}`)
    return
  }
  if (kind === 'force' && !(await read($, stubborn)).includes(pid)) return
  const ran = await run($, kind === 'stop' ? ['kill', String(pid)] : ['kill', '-9', String(pid)], KILL_MS)
  if (ran === null || ran.exitCode !== 0) {
    await say($, `kill failed for ${row.command} (pid ${pid})`)
    return
  }
  if (kind === 'stop') {
    await say($, `Sent SIGTERM to ${row.command} (pid ${pid})`)
    $.clock.after(GRACE_MS, () => void checkAlive($, ctx, pid, row.command))
  } else {
    await update($, stubborn, ids => ids.filter(one => one !== pid))
    await say($, `Sent SIGKILL to ${row.command} (pid ${pid})`)
    $.clock.after(1_000, () => void sync($, ctx, false))
  }
}

async function press($: EngineInterface, ctx: Ctx, kind: 'stop' | 'force', pid: number) {
  const key = `${kind}:${pid}`
  if ((await read($, confirm)) !== key) {
    await update($, confirm, () => key)
    return
  }
  await update($, confirm, () => null)
  await signal($, ctx, kind, pid)
}

async function toggleAllow($: EngineInterface, pid: number) {
  await update($, confirm, () => null)
  await update($, allowed, list => (list.includes(pid) ? list.filter(one => one !== pid) : [...list, pid]))
}

export const register: Register = (on, options) => {
  const ctx: Ctx = { showStatus: options?.statusLine !== false, user: undefined, cwds: new Map(), busy: false }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ports', description: 'Show the local TCP ports your processes listen on, with Stop buttons (refresh | close)' })
    // The baseline snapshot (kept across hot reloads in $.state) is taken off the start path.
    $.clock.after(0, () => void background($, ctx))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (ctx.showStatus && e.agentId === undefined) $.clock.after(0, () => void background($, ctx))

    return done
  })

  on('command.run', { command: 'ports' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Ports pane closed.' }
    }
    const list = await refresh($, ctx)
    await $.ui.open({ id: PANE, title: TITLE })
    if (list === null) return { text: UNAVAILABLE }

    return { text: `Ports pane ${arg === 'refresh' ? 'refreshed' : 'opened'} (${countLabel(list).toLowerCase()}).` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list: PortRow[] = await read($, rows)
    const problem = await read($, error)
    const pending = await read($, confirm)
    const message = await read($, notice)
    const allow = await read($, allowed)
    const survivors = await read($, stubborn)
    const user = ctx.user ?? null

    return (
      <Box flexDirection="column">
        {problem !== null ? <Text dimColor>{problem}</Text> : <Text bold>{countLabel(list)}</Text>}
        {message !== null && <Text>{message}</Text>}
        {list.map(row => {
          const verdict = canStop(row, user, allow)
          const stop = `stop:${row.pid}`
          const force = `force:${row.pid}`
          return (
            <Box flexDirection="column">
              <Text>{rowLabel(row)}</Text>
              {row.cwd !== null && <Text dimColor>{row.cwd}</Text>}
              {!verdict.ok && <Text dimColor>{verdict.reason}</Text>}
              {verdict.ok && <Button key={stop} label={pending === stop ? 'Confirm stop?' : 'Stop'} onPress={() => press($, ctx, 'stop', row.pid)} />}
              {verdict.ok && survivors.includes(row.pid) && (
                <Button key={force} label={pending === force ? 'Confirm kill -9?' : 'Force stop'} onPress={() => press($, ctx, 'force', row.pid)} />
              )}
              {!row.isNew && (verdict.ok || !verdict.hard) && (
                <Button key={`allow:${row.pid}`} label={allow.includes(row.pid) ? 'Allowed ✓' : 'Allow stop'} onPress={() => toggleAllow($, row.pid)} />
              )}
            </Box>
          )
        })}
        <Button key="refresh" label="Refresh" onPress={() => refresh($, ctx)} />
      </Box>
    )
  })
}
