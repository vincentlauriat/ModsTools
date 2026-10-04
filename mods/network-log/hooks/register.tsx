import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { NetEntry } from '../types'
import { classifyTool, header, push, row, statusOf } from './classify'

const PANE = 'network-log'
const TITLE = 'Network'
const entries = atom({ plugin: 'network-log', key: 'entries' } as const, [])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'network-log',
      description: 'Show the network activity of this session (open | close | clear)',
    })

    return next(e)
  })

  on('command.run', { command: 'network-log' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'close' || arg === 'off') {
      await $.ui.close({ id: PANE })
      return { text: 'Network pane closed.' }
    }
    if (arg === 'clear') {
      await update($, entries, () => [])
      return { text: 'Network log cleared.' }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    const list: NetEntry[] = await read($, entries)

    return { text: `Network pane opened (${header(list)}).` }
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as { tool: string; agentId?: string } & Record<string, unknown>
    const hit = classifyTool(input.tool, input)
    if (hit === null) return next(e)
    const ran = await next(e)
    const entry: NetEntry = { ...hit, status: statusOf(ran), sub: input.agentId !== undefined }
    await update($, entries, list => push(list, entry))

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list: NetEntry[] = await read($, entries)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)

    return (
      <Box flexDirection="column">
        <Text bold>{header(list)}</Text>
        {list.length === 0 && <Text dimColor>No network activity yet.</Text>}
        {list.slice(0, room).map(entry => (
          <Text>
            {entry.sub && <Text dimColor>↳ </Text>}
            {row(entry, e.props.bodyColumns)}
          </Text>
        ))}
      </Box>
    )
  })
}
