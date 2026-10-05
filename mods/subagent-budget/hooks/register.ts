import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TurnCount } from '../types'
import { DEFAULT_MAX, FRESH, bump, dayKey, peak, summary, toastText } from './budget'

const turn = atom({ plugin: 'subagent-budget', key: 'turn' } as const, FRESH)

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get('enabled')) !== false
}

// Today's peak: what the store holds for today, or the live count when higher.
async function todayMax($: EngineInterface, live: number): Promise<number> {
  return peak(await $.store.get('today'), dayKey(await $.clock.now()), live).max
}

// Records the turn's count into today's peak. Called from sequential points only
// (prompt.submit, main turn.complete), never from concurrent spawns.
async function savePeak($: EngineInterface): Promise<void> {
  const current: TurnCount = await read($, turn)
  await $.store.set('today', peak(await $.store.get('today'), dayKey(await $.clock.now()), current.count))
}

async function counted($: EngineInterface, max: number): Promise<void> {
  const enabled = await isEnabled($)
  let toast = false
  let count = 0
  await update($, turn, (t: TurnCount) => {
    const out = bump(t, max, enabled)
    toast = out.toast
    count = out.turn.count
    return out.turn
  })
  if (toast) $.ui.toast(toastText(count, max))
}

export const register: Register = (on, options) => {
  const max = typeof options?.max === 'number' ? options.max : DEFAULT_MAX

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'subagent-budget',
      description: 'Subagents spawned this turn, today\'s peak and the budget (on | off toggles the alert)',
    })

    return next(e)
  })

  // A prompt that starts a turn resets the count; one delivered into a running turn (turnId set) does not.
  on('prompt.submit', async ($, e, next) => {
    if (e.turnId === undefined) {
      await savePeak($)
      await update($, turn, () => FRESH)
    }

    return next(e)
  })

  // Every started spawn counts: main loop, nested (spawned by a subagent), teammates, plugins' own.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny === undefined && started.agentId !== undefined) await counted($, max)

    return started
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await savePeak($)

    return next(e)
  })

  on('command.run', { command: 'subagent-budget' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'on' || arg === 'off') {
      await $.store.set('enabled', arg === 'on')
      return { text: `subagent-budget alerts ${arg}.` }
    }
    const current: TurnCount = await read($, turn)

    return { text: summary(current.count, await todayMax($, current.count), max, await isEnabled($)) }
  })
}
