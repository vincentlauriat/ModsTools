import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { shouldPlay } from './format'

const DEFAULT_MIN_SECONDS = 30
const isEnabled = atom({ plugin: 'done-sound', key: 'isEnabled' } as const, true)

async function chime($: EngineInterface): Promise<boolean> {
  try {
    await $.audio.play({ asset: 'sounds/done.wav' })

    return true
  } catch {
    return false
  }
}

async function answer($: EngineInterface, arg: string): Promise<string> {
  if (arg === 'off' || arg === 'on') {
    await update($, isEnabled, () => arg === 'on')

    return `done-sound ${arg}.`
  }
  if (arg === 'test') return (await chime($)) ? 'done-sound: played.' : 'done-sound: audio unavailable.'

  return 'Usage: /done-sound off|on|test'
}

export const register: Register = (on, options) => {
  const minSeconds = typeof options?.minSeconds === 'number' ? options.minSeconds : DEFAULT_MIN_SECONDS
  let startedAt: number | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'done-sound', description: 'done-sound: off|on|test' })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    startedAt = await $.clock.now()

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && startedAt !== null) {
      const ms = (await $.clock.now()) - startedAt
      startedAt = null
      if (shouldPlay(ms, minSeconds) && (await read($, isEnabled))) await chime($)
    }

    return next(e)
  })

  on('command.run', { command: 'done-sound' }, async ($, e) => ({ text: await answer($, e.args.trim()) }))
}
