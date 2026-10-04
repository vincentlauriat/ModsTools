import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { HistoryEntry } from '../types'
import { push, row, statusOf } from './history'

const PANE = 'command-history'
const TITLE = 'Commands'
const entries = atom({ plugin: 'command-history', key: 'entries' } as const, [])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'command-history',
      description: 'Show the Bash commands run this session (open | close | clear)',
    })

    return next(e)
  })

  on('command.run', { command: 'command-history' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'close' || arg === 'off') {
      await $.ui.close({ id: PANE })
      return { text: 'Command history pane closed.' }
    }
    if (arg === 'clear') {
      await update($, entries, () => [])
      return { text: 'Command history cleared.' }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    const count = (await read($, entries)).length

    return { text: `Command history pane opened (${count} command${count === 1 ? '' : 's'}).` }
  })

  // Subagent Bash calls are ignored: the pane is the main conversation's history.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if ((e as { agentId?: string }).agentId !== undefined) return next(e)
    const started = await $.clock.now()
    const ran = await next(e)
    const ms = (await $.clock.now()) - started
    const entry: HistoryEntry = { command: e.command, status: statusOf(ran), ms }
    await update($, entries, list => push(list, entry))

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list: HistoryEntry[] = await read($, entries)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)

    return (
      <Box flexDirection="column">
        <Text bold>
          {list.length} command{list.length === 1 ? '' : 's'}
        </Text>
        {list.length === 0 && <Text dimColor>No Bash commands yet.</Text>}
        {list.slice(0, room).map(entry => (
          <Text>{row(entry, e.props.bodyColumns)}</Text>
        ))}
      </Box>
    )
  })
}
