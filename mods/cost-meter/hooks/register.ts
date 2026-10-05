import type { EngineInterface, Register } from 'claude-code'

import { statusLine, summary } from './format'

const DEFAULT_THRESHOLD = 5

async function refresh($: EngineInterface, threshold: number, alerted: { done: boolean }): Promise<void> {
  const usage = await $.session.usage()
  const usd = usage.cost?.usd
  $.ui.status(statusLine(usd, usage.rateLimits))
  if (usd !== undefined && usd >= threshold && !alerted.done) {
    alerted.done = true
    $.ui.toast(`Session cost passed $${threshold}: now $${usd.toFixed(2)}`)
  }
}

export const register: Register = (on, options) => {
  const threshold = typeof options?.thresholdUsd === 'number' ? options.thresholdUsd : DEFAULT_THRESHOLD
  const alerted = { done: false }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cost-meter', description: 'cost-meter: session cost, rate-limit windows and session duration' })
    await refresh($, threshold, alerted)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await refresh($, threshold, alerted)

    return next(e)
  })

  on('command.run', { command: 'cost-meter' }, async $ => {
    const usage = await $.session.usage()

    return { text: summary(usage.cost?.usd, usage.rateLimits, usage.startedAt, await $.clock.now()) }
  })
}
