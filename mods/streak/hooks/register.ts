import type { EngineInterface, Register } from 'claude-code'

import { addDay, crossedMilestone, dayKey, stats, statusLine, summary } from './days'

const KEY = 'days'

async function load($: EngineInterface): Promise<string[]> {
  const value = await $.store.get(KEY)

  return Array.isArray(value) ? (value as string[]) : []
}

async function show($: EngineInterface, days: string[]): Promise<void> {
  $.ui.status(statusLine(stats(days, dayKey(await $.clock.now())).current))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'streak', description: 'Streak of consecutive active days: current, longest, total' })
    await show($, await load($))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const today = dayKey(await $.clock.now())
      const days = await load($)
      const before = stats(days, today).current
      const updated = addDay(days, today)
      const after = stats(updated, today).current
      await $.store.set(KEY, updated)
      await show($, updated)
      const milestone = crossedMilestone(before, after)
      if (milestone !== undefined) $.ui.toast(`🔥 ${milestone}-day streak!`)
    }

    return next(e)
  })

  on('command.run', { command: 'streak' }, async $ => ({
    text: summary(stats(await load($), dayKey(await $.clock.now()))),
  }))
}
