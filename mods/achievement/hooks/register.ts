import type { EngineInterface, Register } from 'claude-code'

import { applyEvent, badgeName, listing, normalize } from './rules'
import type { Ev, State } from './rules'

const KEY = 'state'

async function record($: EngineInterface, ev: Ev): Promise<void> {
  const { state, unlocked } = applyEvent(normalize(await $.store.get(KEY)), ev)
  await $.store.set(KEY, state)
  for (const id of unlocked) $.ui.toast(`🏆 Achievement unlocked: ${badgeName(id)}`)
}

export const register: Register = on => {
  let spawns = 0

  on('session.start', async ($, e, next) => {
    spawns = 0
    await $.command.register({ name: 'achievements', description: 'Badges unlocked and still locked: [reset]' })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const bash = e.tool === 'Bash'
    await record($, {
      kind: 'tool',
      tool: e.tool,
      command: bash ? e.command : undefined,
      isError: ran.isError === true,
      stdout: bash ? (ran.result as { stdout?: string } | undefined)?.stdout : undefined,
    })

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await record($, { kind: 'turn', hour: new Date(await $.clock.now()).getHours(), durationMs: e.durationMs })
    }

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined || started.agentId === undefined) return started
    spawns += 1
    await record($, { kind: 'spawn', count: spawns })

    return started
  })

  on('command.run', { command: 'achievements' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'reset') {
      await $.store.delete(KEY)

      return { text: 'Achievements reset.' }
    }
    if (arg !== '') return { text: 'Usage: /achievements [reset]' }
    const state: State = normalize(await $.store.get(KEY))

    return { text: listing(state) }
  })
}
