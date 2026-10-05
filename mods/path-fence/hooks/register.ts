import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { bashOutside, fileOutside, parseRoots } from './rules'
import type { Fence } from './rules'

const isOff = atom({ plugin: 'path-fence', key: 'isOff' } as const, false)

let extraRoots: string[] = []

async function fence($: EngineInterface): Promise<Fence> {
  return { cwd: await $.session.cwd(), home: await $.env.get('HOME'), extraRoots }
}

async function escalate<T extends { decision: string }>(
  $: EngineInterface,
  verdict: T,
  find: (f: Fence) => string | null,
): Promise<T | { decision: 'ask'; reason: string }> {
  if (verdict.decision === 'deny' || (await read($, isOff))) return verdict
  const outside = find(await fence($))
  if (outside === null) return verdict

  return {
    decision: 'ask',
    reason: `path-fence: this writes outside the session folder (${outside}). Confirm only if the user expects it. If refused, ask the user: they can allow it with "! <command>" or stop the checks with /path-fence off.`,
  }
}

export const register: Register = (on, options) => {
  extraRoots = parseRoots(options?.allowedRoots)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'path-fence',
      description: 'path-fence on|off|status: ask before writing outside the session folder',
    })

    return next(e)
  })

  on('command.run', { command: 'path-fence' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')
      $.ui.status(arg === 'off' ? 'path-fence: OFF' : undefined)
    }
    const off = await read($, isOff)
    const f = await fence($)

    return { text: `path-fence is ${off ? 'OFF for this session' : 'ON'}. Fence: ${f.cwd}${extraRoots.length > 0 ? `, ${extraRoots.join(', ')}` : ''} (plus ~/.claude and tmp dirs).` }
  })

  for (const tool of ['Edit', 'Write', 'NotebookEdit'] as const) {
    on('tool.check', { tool }, async ($, e, next) => {
      const verdict = await next(e)

      return escalate($, verdict, f => fileOutside((e.input ?? {}) as Record<string, unknown>, f))
    })
  }

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const verdict = await next(e)
    const command = (e.input as { command?: unknown }).command

    return typeof command === 'string' ? escalate($, verdict, f => bashOutside(command, f)) : verdict
  })
}
