import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { bandText, minutesLeft, parseMinutes } from './format'

const IDLE = { endsAt: null, now: 0, isDone: false }
const focus = atom({ plugin: 'focus-mode', key: 'focus' } as const, IDLE)
const DONE_TEXT = 'Focus done — take a break'

let ticker: Timer | null = null

async function tick($: EngineInterface) {
  const now = await $.clock.now()
  const state = await read($, focus)
  if (state.endsAt !== null && now >= state.endsAt) {
    await update($, focus, () => ({ endsAt: null, now, isDone: true }))
    $.ui.toast(DONE_TEXT)
  } else {
    await update($, focus, s => ({ ...s, now }))
  }
}

function ensureTicker($: EngineInterface) {
  if (ticker === null) ticker = $.clock.every(60_000, () => void tick($))
}

async function start($: EngineInterface, minutes: number) {
  const now = await $.clock.now()
  await update($, focus, () => ({ endsAt: now + minutes * 60_000, now, isDone: false }))
  ensureTicker($)
}

async function stop($: EngineInterface) {
  await update($, focus, () => IDLE)
  ticker?.cancel()
  ticker = null
}

async function answer($: EngineInterface, arg: string): Promise<string> {
  if (arg === 'stop') {
    await stop($)

    return 'Focus stopped.'
  }
  const state = await read($, focus)
  if (arg === '' && state.endsAt !== null) {
    return `Focus: ${minutesLeft(state.endsAt, await $.clock.now())} min left.`
  }
  const minutes = parseMinutes(arg)
  if (minutes === null) return 'Usage: /focus [minutes 1-480] | /focus stop'
  await start($, minutes)

  return `Focus started: ${minutes} min.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'focus', description: 'Pomodoro: /focus [minutes] | /focus stop' })
    const state = await read($, focus)
    if (state.endsAt !== null) ensureTicker($)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const state = await read($, focus)
    if (state.endsAt !== null) ensureTicker($)

    return next(e)
  })

  on('command.run', { command: 'focus' }, async ($, e) => ({ text: await answer($, e.args.trim()) }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, focus)
    if (e.props.hasSurvey || (state.endsAt === null && !state.isDone)) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    if (state.endsAt === null) {
      return (
        <Box>
          <Text>{`🎯 ${DONE_TEXT}`}</Text>
          <Button key="dismiss" label="Dismiss" onPress={() => update($, focus, () => IDLE)} />
        </Box>
      )
    }

    return <Text dimColor>{bandText(state.endsAt, state.now)}</Text>
  })
}
