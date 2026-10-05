import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { formatContext, nextTodos, parseStatus } from './context'
import type { GitInfo } from './context'

const SECTION = 'auto-context:session'
const text = atom({ plugin: 'auto-context', key: 'text' } as const, null)

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get('enabled')) !== false
}

async function git($: EngineInterface): Promise<GitInfo | null> {
  try {
    const status = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { cwd: await $.session.cwd() })
    if (status.exitCode !== 0) return null
    const log = await $.process.run(['git', 'log', '-1', '--format=%s'], { cwd: await $.session.cwd() })

    return { ...parseStatus(status.stdout), subject: log.exitCode === 0 ? log.stdout.trim() : '' }
  } catch {
    return null
  }
}

async function todos($: EngineInterface): Promise<string[]> {
  try {
    return nextTodos(await $.fs.read(`${await $.session.cwd()}/TODOS.md`))
  } catch {
    return []
  }
}

async function refresh($: EngineInterface) {
  const value = formatContext(await git($), await todos($))
  await update($, text, () => value)
  $.ui.invalidate('prompt.section')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'auto-context', description: 'Show the injected session context; "off" or "on" toggles it' })
    await refresh($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await refresh($)

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const value = await read($, text)
    if (value === null || !(await isEnabled($))) return composed

    return { sections: [...composed.sections, { id: SECTION, text: value, scope: 'session' as const }] }
  })

  on('command.run', { command: 'auto-context' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'on' || arg === 'off') {
      await $.store.set('enabled', arg === 'on')
      $.ui.invalidate('prompt.section')
      if (arg === 'on') await refresh($)

      return { text: `auto-context ${arg}.` }
    }
    if (!(await isEnabled($))) return { text: 'auto-context is off.' }

    return { text: (await read($, text)) ?? 'Nothing to inject (no git repository, no TODOS.md items).' }
  })
}
