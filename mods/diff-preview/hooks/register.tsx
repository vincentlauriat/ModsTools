import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DiffSnapshot } from '../types'
import { NOT_A_REPO, failed, snapshot, untrackedLabel } from './diff'

const PANE = 'diff-preview'
const TITLE = 'Diff'
const empty: DiffSnapshot = { error: null, stat: [], untracked: 0 }
const current = atom({ plugin: 'diff-preview', key: 'snapshot' } as const, empty)

async function refresh($: EngineInterface) {
  const cwd = await $.session.cwd()
  let next: DiffSnapshot
  try {
    const stat = await $.process.run(['git', 'diff', '--stat'], { cwd, timeoutMs: 10_000 })
    const porcelain = await $.process.run(['git', 'status', '--porcelain'], { cwd, timeoutMs: 10_000 })
    next = stat.exitCode !== 0 || porcelain.exitCode !== 0 ? failed(NOT_A_REPO) : snapshot(stat.stdout, porcelain.stdout)
  } catch {
    next = failed('git unavailable')
  }
  await update($, current, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'diff-preview',
      description: 'Show git diff --stat in a pane (open | close | refresh)',
    })

    return next(e)
  })

  on('command.run', { command: 'diff-preview' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'close' || arg === 'off') {
      await $.ui.close({ id: PANE })
      return { text: 'Diff pane closed.' }
    }
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })
    const snap: DiffSnapshot = await read($, current)

    return { text: snap.error ?? `Diff pane ${arg === 'refresh' ? 'refreshed' : 'opened'} (${untrackedLabel(snap.untracked)}).` }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) await refresh($)

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap: DiffSnapshot = await read($, current)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)

    if (snap.error !== null) return <Text dimColor>{snap.error}</Text>

    return (
      <Box flexDirection="column">
        {snap.stat.length === 0 && <Text dimColor>No changes to tracked files.</Text>}
        {snap.stat.slice(0, room).map(line => (
          <Text>{line.trim()}</Text>
        ))}
        <Text bold>{untrackedLabel(snap.untracked)}</Text>
      </Box>
    )
  })
}
