import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { DANGER, isShown, label } from './gauge'

const percent = atom({ plugin: 'context-gauge', key: 'percent' } as const, null)

async function refresh($: EngineInterface): Promise<void> {
  const usage = await $.session.usage()
  await update($, percent, () => usage.context.percent ?? null)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await refresh($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const value = await read($, percent)
    if (e.props.hasSurvey || !isShown(value)) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color={value >= DANGER ? 'red' : 'yellow'}>{label(value)}</Text>
      </Box>
    )
  })
}
