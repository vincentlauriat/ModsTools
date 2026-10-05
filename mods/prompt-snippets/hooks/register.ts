import type { EngineInterface, Register } from 'claude-code'

import { expand, parseCommand } from './snippets'
import type { Snippets } from './snippets'

const KEY = 'snippets'

async function load($: EngineInterface): Promise<Snippets> {
  const value = await $.store.get(KEY)

  return typeof value === 'object' && value !== null ? (value as Snippets) : {}
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'snip',
      description: 'Prompt snippets: add <name> <text> | rm <name> | list | show <name>; use ;;name in a prompt',
    })

    return next(e)
  })

  on('command.run', { command: 'snip' }, async ($, e) => {
    const cmd = parseCommand(e.args)
    if (cmd.action === 'error') return { text: cmd.message }
    const snippets = await load($)
    if (cmd.action === 'list') {
      const names = Object.keys(snippets).sort()

      return { text: names.length === 0 ? 'No snippets yet.' : `Snippets: ${names.map(n => `;;${n}`).join(' ')}` }
    }
    if (cmd.action === 'show') {
      const body = Object.hasOwn(snippets, cmd.name) ? snippets[cmd.name] : undefined

      return { text: body === undefined ? `No snippet "${cmd.name}".` : `;;${cmd.name} = ${body}` }
    }
    if (cmd.action === 'rm') {
      if (!Object.hasOwn(snippets, cmd.name)) return { text: `No snippet "${cmd.name}".` }
      const { [cmd.name]: _removed, ...rest } = snippets
      await $.store.set(KEY, rest)

      return { text: `Removed ;;${cmd.name}.` }
    }
    await $.store.set(KEY, { ...snippets, [cmd.name]: cmd.text })

    return { text: `Saved ;;${cmd.name}.` }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!e.text.includes(';;') || e.text.trimStart().startsWith('/snip')) return next(e)
    const { text, unknown } = expand(e.text, await load($))
    if (unknown.length > 0) $.ui.toast(`Unknown snippet${unknown.length === 1 ? '' : 's'}: ${unknown.map(n => `;;${n}`).join(', ')}`)

    return next({ ...e, text })
  })
}
