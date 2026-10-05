import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AdvisorState } from '../types'
import { DEFAULT_THRESHOLD, EMPTY, compactLine, firstLine, isUserGoal, openTodos, relative, step, toastText, touch } from './advisor'

const track = atom({ plugin: 'compact-advisor', key: 'track' } as const, EMPTY)

async function branch($: EngineInterface): Promise<string | null> {
  try {
    const out = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: await $.session.cwd() })
    return out.exitCode === 0 ? out.stdout.trim() : null
  } catch {
    return null
  }
}

async function todos($: EngineInterface): Promise<string[]> {
  try {
    return openTodos(await $.fs.read(`${await $.session.cwd()}/TODOS.md`))
  } catch {
    return []
  }
}

async function check($: EngineInterface, threshold: number): Promise<void> {
  const percent = (await $.session.usage()).context.percent
  const state: AdvisorState = await read($, track)
  const next = step(state.armed, percent, threshold)
  if (next.armed !== state.armed) await update($, track, s => ({ ...s, armed: next.armed }))
  if (next.toast && percent !== undefined) $.ui.toast(toastText(percent))
}

export const register: Register = (on, options) => {
  const threshold = typeof options?.threshold === 'number' ? options.threshold : DEFAULT_THRESHOLD

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'compact-advisor',
      description: 'Print a ready-to-paste /compact line: branch, edited files, open tasks, last goal',
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (isUserGoal(e.origin.kind, e.text)) {
      const goal = firstLine(e.text)
      await update($, track, s => ({ ...s, goal }))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) return ran
    const path = e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : e.tool === 'NotebookEdit' ? e.notebook_path : null
    if (path !== null) {
      const shown = relative(path, await $.session.cwd())
      await update($, track, s => ({ ...s, files: touch(s.files, shown) }))
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await check($, threshold)

    return next(e)
  })

  on('command.run', { command: 'compact-advisor' }, async $ => {
    const state: AdvisorState = await read($, track)

    return { text: compactLine({ branch: await branch($), files: state.files, todos: await todos($), goal: state.goal }) }
  })
}
