import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { addEntry, firstLine, formatDay, formatWeek, projectName } from './journal'
import type { Entry } from './journal'

const KEY = 'entries'
const DAY_MS = 86_400_000
const pending = atom({ plugin: 'session-journal', key: 'pending' } as const, { prompt: '', tools: 0, files: [] as string[] })

async function entries($: EngineInterface): Promise<Entry[]> {
  const value = await $.store.get(KEY)

  return Array.isArray(value) ? (value as Entry[]) : []
}

async function note($: EngineInterface, path: string | undefined) {
  await update($, pending, p => ({
    ...p,
    tools: p.tools + 1,
    files: path !== undefined && !p.files.includes(path) ? [...p.files, path] : p.files,
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'journal', description: 'Cross-session journal: [yesterday|week|clear]' })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, pending, () => ({ prompt: firstLine(e.text), tools: 0, files: [] }))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined) return ran
    const input = e as { file_path?: string; notebook_path?: string }
    const isEdit = e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit'
    await note($, isEdit ? (e.tool === 'NotebookEdit' ? input.notebook_path : input.file_path) : undefined)

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const p = await read($, pending)
      const now = await $.clock.now()
      const entry: Entry = { time: now, project: projectName(await $.session.cwd()), prompt: p.prompt, tools: p.tools, files: p.files.length }
      await $.store.set(KEY, addEntry(await entries($), entry, now))
      await update($, pending, () => ({ prompt: '', tools: 0, files: [] }))
    }

    return next(e)
  })

  on('command.run', { command: 'journal' }, async ($, e) => {
    const arg = e.args.trim()
    const now = await $.clock.now()
    if (arg === 'clear') {
      await $.store.delete(KEY)

      return { text: 'Journal cleared.' }
    }
    if (arg === 'week') return { text: formatWeek(await entries($), now) }
    if (arg === 'yesterday') return { text: formatDay(await entries($), now - DAY_MS) }
    if (arg === '') return { text: formatDay(await entries($), now) }

    return { text: 'Usage: /journal [yesterday|week|clear]' }
  })
}
