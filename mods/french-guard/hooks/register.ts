import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { messages } from './detect'

const guard = atom({ plugin: 'french-guard', key: 'guard' } as const, { isEnabled: true, last: 'no answer checked yet' })

async function answer($: EngineInterface, arg: string): Promise<string> {
  if (arg === 'off' || arg === 'on') {
    await update($, guard, g => ({ ...g, isEnabled: arg === 'on' }))

    return `french-guard ${arg}.`
  }
  if (arg === 'status' || arg === '') {
    const g = await read($, guard)

    return `french-guard ${g.isEnabled ? 'on' : 'off'}; last check: ${g.last}`
  }

  return 'Usage: /french-guard off|on|status'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'french-guard', description: 'french-guard: off|on|status' })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, guard)).isEnabled) {
      const found = messages(e.answer)
      for (const text of found) $.ui.toast(text)
      await update($, guard, g => ({ ...g, last: found.length === 0 ? 'ok' : found.join('; ') }))
    }

    return next(e)
  })

  on('command.run', { command: 'french-guard' }, async ($, e) => ({ text: await answer($, e.args.trim()) }))
}
