import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Simulator } from '../types'
import { ALL, UNAVAILABLE, countLabel, parseBooted, rowLabel, shutdownToast, statusText } from './simulators'

const PANE = 'simulator-pane'
const TITLE = 'Simulators'
const LIST_MS = 10_000
const SHUTDOWN_MS = 60_000
const rows = atom({ plugin: 'simulator-pane', key: 'rows' } as const, [])
const error = atom({ plugin: 'simulator-pane', key: 'error' } as const, null)
const confirm = atom({ plugin: 'simulator-pane', key: 'confirm' } as const, null)
const notice = atom({ plugin: 'simulator-pane', key: 'notice' } as const, null)

// The booted simulators, or null when simctl cannot be run or answers something else.
async function listBooted($: EngineInterface): Promise<Simulator[] | null> {
  try {
    const ran = await $.process.run(['xcrun', 'simctl', 'list', 'devices', 'booted', '-j'], { timeoutMs: LIST_MS })

    return ran.exitCode === 0 ? parseBooted(ran.stdout) : null
  } catch {
    return null
  }
}

// One simctl call: updates the rows and, when enabled, the status line. Leaves a pending confirm alone.
async function sync($: EngineInterface, showStatus: boolean): Promise<Simulator[] | null> {
  const list = await listBooted($)
  await update($, rows, () => list ?? [])
  await update($, error, () => (list === null ? UNAVAILABLE : null))
  if (showStatus) $.ui.status(statusText(list === null ? null : list.length))

  return list
}

// Reloads the list; a refresh always resets a pending confirm.
async function refresh($: EngineInterface, showStatus: boolean, message: string | null = null): Promise<Simulator[] | null> {
  const list = await sync($, showStatus)
  await update($, confirm, () => null)
  await update($, notice, () => message)

  return list
}

async function shutdown($: EngineInterface, showStatus: boolean, target: string) {
  const all = target === ALL
  const sim = all ? undefined : (await read($, rows)).find(one => one.udid === target)
  if (!all && sim === undefined) {
    await refresh($, showStatus)
    return
  }
  let message: string
  try {
    const ran = await $.process.run(['xcrun', 'simctl', 'shutdown', all ? 'all' : target], { timeoutMs: SHUTDOWN_MS })
    message = shutdownToast(sim?.name ?? null, ran.exitCode, ran.stderr)
  } catch {
    message = `simctl shutdown failed: ${UNAVAILABLE} or timed out`
  }
  await refresh($, showStatus, message)
  $.ui.toast(message)
}

async function press($: EngineInterface, showStatus: boolean, target: string) {
  if ((await read($, confirm)) === target) await shutdown($, showStatus, target)
  else await update($, confirm, () => target)
}

export const register: Register = (on, options) => {
  const showStatus = options?.statusLine !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'simulators',
      description: 'Show the booted simulators in a pane with Shut down buttons (open | refresh | close)',
    })
    if (showStatus) await sync($, showStatus)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (showStatus && e.agentId === undefined) await sync($, showStatus)

    return next(e)
  })

  on('command.run', { command: 'simulators' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'close' || arg === 'off') {
      await $.ui.close({ id: PANE })
      return { text: 'Simulators pane closed.' }
    }
    const list = await refresh($, showStatus)
    await $.ui.open({ id: PANE, title: TITLE })
    if (list === null) return { text: UNAVAILABLE }

    return { text: `Simulators pane ${arg === 'refresh' ? 'refreshed' : 'opened'} (${countLabel(list.length).toLowerCase()}).` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list: Simulator[] = await read($, rows)
    const problem = await read($, error)
    const pending = await read($, confirm)
    const message = await read($, notice)

    return (
      <Box flexDirection="column">
        {problem !== null ? <Text dimColor>{problem}</Text> : <Text bold>{countLabel(list.length)}</Text>}
        {message !== null && <Text>{message}</Text>}
        {list.map(sim => (
          <Box flexDirection="column">
            <Text>{rowLabel(sim)}</Text>
            <Button key={`shutdown:${sim.udid}`} label={pending === sim.udid ? 'Confirm?' : 'Shut down'} onPress={() => press($, showStatus, sim.udid)} />
          </Box>
        ))}
        {list.length > 0 && <Button key="shutdown-all" label={pending === ALL ? 'Confirm?' : 'Shut down all'} onPress={() => press($, showStatus, ALL)} />}
        <Button key="refresh" label="Refresh" onPress={() => refresh($, showStatus)} />
      </Box>
    )
  })
}
