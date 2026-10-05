import type { EngineInterface, Register } from 'claude-code'

import { dayKey, normalize, promptLength, record, report } from './stats'
import type { Days } from './stats'

const KEY = 'days'
// Prompts the person typed: at the terminal, or through Remote Control.
const PERSON = new Set(['composer', 'bridge'])
const SLASH = /^\/[\w:.-]+(\s|$)/

async function load($: EngineInterface): Promise<Days> {
  return normalize(await $.store.get(KEY))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'typing-stats', description: 'Your prompts per day and hour: [week|month|reset]' })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const entered = await next(e)
    if ('drop' in entered && entered.drop !== undefined) return entered
    if (!PERSON.has(e.origin.kind) || SLASH.test(e.text)) return entered
    // Only the count, the length and the hour are kept, never the text.
    await $.store.set(KEY, record(await load($), await $.clock.now(), promptLength(e.text)))

    return entered
  })

  on('command.run', { command: 'typing-stats' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'reset') {
      await $.store.delete(KEY)

      return { text: 'Typing stats reset.' }
    }
    if (arg !== '' && arg !== 'week' && arg !== 'month') return { text: 'Usage: /typing-stats [week|month|reset]' }
    const today = dayKey(await $.clock.now())

    return { text: report(await load($), today, arg === '' ? 'default' : arg) }
  })
}
