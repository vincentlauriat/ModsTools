import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Turn } from '../types'
import { formatDuration } from './format'

const SLOW_MS = 120_000
const last = atom({ plugin: 'turn-timer', key: 'last' } as const, null)
const isHidden = atom({ plugin: 'turn-timer', key: 'isHidden' } as const, false)

export const register: Register = on => {
  let startedAt: number | null = null
  let tools = 0

  on('prompt.submit', async ($, e, next) => {
    startedAt = await $.clock.now()
    tools = 0

    return next(e)
  })

  on('tool.call', ($, e, next) => {
    tools += 1

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const ms = e.durationMs ?? (startedAt === null ? 0 : (await $.clock.now()) - startedAt)
    const turn: Turn = { ms, tools }
    await update($, last, () => turn)
    await update($, isHidden, () => false)
    if (ms > SLOW_MS) $.ui.toast(`Slow turn: ${formatDuration(ms)}, ${tools} tool calls`)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const turn = await read($, last)
    if (e.props.hasSurvey || turn === null || (await read($, isHidden))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const label = `⏱ last turn ${formatDuration(turn.ms)} · ${turn.tools} tool${turn.tools === 1 ? '' : 's'}`

    return (
      <Box>
        <Text dimColor>{label}</Text>
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
