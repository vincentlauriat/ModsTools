import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { HeatmapTool } from '../types'
import { count, rows, total } from './heat'

const PANE = 'tool-heatmap'
const TITLE = 'Tool heatmap'
const tools = atom({ plugin: 'tool-heatmap', key: 'tools' } as const, [])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tool-heatmap',
      description: 'Show tool calls and failures per tool in a pane',
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'tool-heatmap' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: `Tool heatmap pane opened. ${total(await read($, tools))}.` }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const isFailure = ran.deny !== undefined || ran.isError === true
    await update($, tools, list => count(list, String(e.tool), isFailure))

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list: HeatmapTool[] = await read($, tools)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)

    return (
      <Box flexDirection="column">
        <Text bold>{total(list)}</Text>
        {list.length === 0 && <Text dimColor>No tool calls yet.</Text>}
        {rows(list, e.props.bodyColumns)
          .slice(0, room)
          .map(line => (
            <Text>{line}</Text>
          ))}
      </Box>
    )
  })
}
