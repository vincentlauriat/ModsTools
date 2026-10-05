import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { checkBash, checkFileTool } from './rules'

const isOff = atom({ plugin: 'env-protect', key: 'isOff' } as const, false)

async function escalate<T extends { decision: string }>(
  $: EngineInterface,
  verdict: T,
  why: string | null,
): Promise<T | { decision: 'ask'; reason: string }> {
  if (why === null || verdict.decision === 'deny' || (await read($, isOff))) return verdict

  return {
    decision: 'ask',
    reason: `env-protect: this reads a secret file (${why}). Confirm only if the user expects it. If refused, ask the user: they can paste what is needed or stop the checks with /env-protect off.`,
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'env-protect',
      description: 'env-protect on|off|status: ask before reading secret files (.env, private keys, .netrc…)',
    })

    return next(e)
  })

  on('command.run', { command: 'env-protect' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')
      $.ui.status(arg === 'off' ? 'env-protect: OFF' : undefined)
    }
    const off = await read($, isOff)

    return { text: `env-protect is ${off ? 'OFF for this session' : 'ON'}.` }
  })

  for (const tool of ['Read', 'Grep', 'Glob'] as const) {
    on('tool.check', { tool }, async ($, e, next) => {
      const verdict = await next(e)

      return escalate($, verdict, checkFileTool(tool, (e.input ?? {}) as Record<string, unknown>))
    })
  }

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const verdict = await next(e)
    const command = (e.input as { command?: unknown }).command

    return escalate($, verdict, typeof command === 'string' ? checkBash(command) : null)
  })
}
