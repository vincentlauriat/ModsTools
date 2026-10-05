import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { findSecret } from './rules'

const isOff = atom({ plugin: 'secret-shield', key: 'isOff' } as const, false)

async function refusal($: EngineInterface, field: string, text: string): Promise<string | null> {
  if (await read($, isOff)) return null
  const found = findSecret(text)
  if (found === null) return null
  $.ui.toast(`secret-shield blocked a ${found.kind} (${found.preview})`)

  return (
    `secret-shield: refused, the ${field} contains what looks like a ${found.kind} (${found.preview}). ` +
    'Never write secrets into files or commands: read them from an environment variable or a secret store, or use a placeholder. ' +
    'If this is a false positive, ask the user; they can allow it for this session with /secret-shield off.'
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'secret-shield',
      description: 'secret-shield on|off|status: refuse or allow secret-looking values in Write, Edit and Bash',
    })

    return next(e)
  })

  on('command.run', { command: 'secret-shield' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')
      $.ui.status(arg === 'off' ? 'secret-shield: OFF' : undefined)
    }
    const off = await read($, isOff)

    return { text: `secret-shield is ${off ? 'OFF for this session' : 'ON'}.` }
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const deny = await refusal($, 'file content', e.content)
    return deny === null ? next(e) : { deny }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const deny = await refusal($, 'new text', e.new_string)
    return deny === null ? next(e) : { deny }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const deny = await refusal($, 'command', e.command)
    return deny === null ? next(e) : { deny }
  })
}
