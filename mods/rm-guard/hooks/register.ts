import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { check } from './rules'

const isOff = atom({ plugin: 'rm-guard', key: 'isOff' } as const, false)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rm-guard',
      description: 'rm-guard on|off|status: ask before destructive commands (rm -rf, git reset --hard, DROP TABLE…)',
    })

    return next(e)
  })

  on('command.run', { command: 'rm-guard' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')
      $.ui.status(arg === 'off' ? 'rm-guard: OFF' : undefined)
    }
    const off = await read($, isOff)

    return { text: `rm-guard is ${off ? 'OFF for this session' : 'ON'}.` }
  })

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const verdict = await next(e)
    const command = (e.input as { command?: unknown }).command
    if (verdict.decision === 'deny' || typeof command !== 'string' || (await read($, isOff))) return verdict
    const reason = check(command)
    if (reason === null) return verdict

    return {
      decision: 'ask',
      reason: `rm-guard: destructive command (${reason}). Confirm only if you meant it. If refused, ask the user: they can run it with "! <command>" or stop the checks with /rm-guard off.`,
    }
  })
}
