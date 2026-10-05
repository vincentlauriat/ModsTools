import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LastTurn } from '../types'
import { pickMood } from './mood'

const last = atom({ plugin: 'mood-band', key: 'last' } as const, null)

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get('enabled')) === true
}

export const register: Register = on => {
  let startedAt: number | null = null
  let total = 0
  let failed = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mood', description: 'mood-band: "on" or "off" shows or hides the mascot band' })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    startedAt = await $.clock.now()
    total = 0
    failed = 0

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      total += 1
      if (result.deny !== undefined || result.isError) failed += 1
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const now = await $.clock.now()
    const ms = e.durationMs ?? (startedAt === null ? 0 : now - startedAt)
    const turn: LastTurn = { failed, total, ms, errored: e.isAborted || e.reason === 'error', at: now }
    await update($, last, () => turn)

    return next(e)
  })

  on('command.run', { command: 'mood' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg !== 'on' && arg !== 'off') return { text: `mood-band is ${(await isEnabled($)) ? 'on' : 'off'}. Use /mood on or /mood off.` }
    await $.store.set('enabled', arg === 'on')
    $.ui.invalidate('ui.render')

    return { text: `mood-band ${arg}.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const turn = await read($, last)
    if (e.props.hasSurvey || turn === null || !(await isEnabled($))) return next(e)
    const mood = pickMood({ ...turn, idleMs: (await $.clock.now()) - turn.at })
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>{`${mood.face} ${mood.caption}`}</Text>
      </Box>
    )
  })
}
