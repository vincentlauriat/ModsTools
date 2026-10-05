import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { buildBrief } from './brief'

const SECTION = 'resume-brief:session'
const text = atom({ plugin: 'resume-brief', key: 'text' } as const, null)

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get('enabled')) !== false
}

async function load($: EngineInterface, cwd: string, name: string): Promise<string | null> {
  try {
    return await $.fs.read(`${cwd}/${name}`)
  } catch {
    return null
  }
}

async function refresh($: EngineInterface) {
  const cwd = await $.session.cwd()
  const [commands, memory, plan, changes] = await Promise.all(['COMMANDS.md', 'MEMORY.md', 'PLAN.md', 'CHANGES.md'].map(name => load($, cwd, name)))
  const value = buildBrief({ commands, memory, plan, changes })
  await update($, text, () => value)
  $.ui.invalidate('prompt.section')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'resume-brief', description: 'Show the "where we left off" brief; "off" or "on" toggles it' })
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

  on('command.run', { command: 'resume-brief' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'on' || arg === 'off') {
      await $.store.set('enabled', arg === 'on')
      $.ui.invalidate('prompt.section')
      if (arg === 'on') await refresh($)

      return { text: `resume-brief ${arg}.` }
    }
    if (!(await isEnabled($))) return { text: 'resume-brief is off.' }

    return { text: (await read($, text)) ?? 'Nothing to brief (no COMMANDS.md, MEMORY.md, PLAN.md or CHANGES.md content).' }
  })
}
