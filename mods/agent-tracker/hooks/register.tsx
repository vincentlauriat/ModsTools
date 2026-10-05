import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { finish, label, rowText } from './rows'

const PANE = 'agent-tracker'
const TITLE = 'Agents'
const rows = atom({ plugin: 'agent-tracker', key: 'rows' } as const, [])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agent-tracker',
      description: 'Show the subagents launched this session (open | close | clear)',
    })

    return next(e)
  })

  on('command.run', { command: 'agent-tracker' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Agents pane closed.' }
    }
    if (arg === 'clear') {
      await update($, rows, list => list.filter(row => row.status === 'running'))
      return { text: 'Finished agents cleared.' }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    const count = (await read($, rows)).length

    return { text: `Agents pane opened (${count} agent${count === 1 ? '' : 's'}).` }
  })

  // agent.spawn resolves once the subagent started, foreground or background alike;
  // its end is the subagent's own turn.complete (below).
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined || started.agentId === undefined || e.isTeammate) return started
    const agentId = started.agentId
    const startedAt = await $.clock.now()
    await update($, rows, list => [
      ...list,
      { id: agentId, label: label(e.description, e.subagentType), status: 'running' as const, startedAt },
    ])

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const now = await $.clock.now()
      await update($, rows, list => finish(list, id, e.reason, now))
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, rows)
    const now = await $.clock.now()
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)
    const running = list.filter(row => row.status === 'running').length

    return (
      <Box flexDirection="column">
        <Text bold>
          {list.length} agent{list.length === 1 ? '' : 's'}
          <Text dimColor> · {running} running</Text>
        </Text>
        {list.length === 0 && <Text dimColor>No subagent launched yet.</Text>}
        {list
          .slice(-room)
          .reverse()
          .map(row => (
            <Text key={`agent:${row.id}`}>{rowText(row, now)}</Text>
          ))}
      </Box>
    )
  })
}
