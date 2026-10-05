import type { EngineInterface, Register } from 'claude-code'

import { RULES, applyEdit, checkCommand, checkKeyChange } from './rules'
import type { Replacement, Verdict } from './rules'

type FileInput = { file_path?: unknown; content?: unknown; old_string?: unknown; new_string?: unknown; replace_all?: unknown; edits?: unknown }

async function readText($: EngineInterface, path: string): Promise<string | null> {
  try {
    return await $.fs.read(path)
  } catch {
    return null
  }
}

const asReplacement = (one: unknown): Replacement | null => {
  const edit = one as FileInput
  if (typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') return null

  return { old_string: edit.old_string, new_string: edit.new_string, replace_all: edit.replace_all === true }
}

// The verdict on a file tool call: the file's text before, against the text the call leaves.
async function checkFile($: EngineInterface, tool: string, input: FileInput): Promise<Verdict | null> {
  if (typeof input.file_path !== 'string') return null
  const path = input.file_path.startsWith('/') ? input.file_path : `${await $.session.cwd()}/${input.file_path}`
  const before = await readText($, path)
  if (tool === 'Write') return typeof input.content === 'string' ? checkKeyChange(path, before, input.content) : null
  if (before === null) return null
  const edits = Array.isArray(input.edits) ? input.edits.map(asReplacement) : [asReplacement(input)]
  if (edits.some(edit => edit === null)) return null

  return checkKeyChange(path, before, (edits as Replacement[]).reduce(applyEdit, before))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sparkle-guard',
      description: 'sparkle-guard status: the rules protecting the Sparkle EdDSA signing key',
    })

    return next(e)
  })

  on('command.run', { command: 'sparkle-guard' }, async () => ({
    text: `sparkle-guard protects the Sparkle EdDSA signing key:\n${RULES.map(rule => `- ${rule}`).join('\n')}`,
  }))

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'deny') return verdict
    let mine: Verdict | null = null
    if (e.tool === 'Bash') {
      const command = (e.input as { command?: unknown }).command
      mine = typeof command === 'string' ? checkCommand(command) : null
    } else if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'MultiEdit') {
      mine = await checkFile($, e.tool, e.input as FileInput)
    }

    return mine ?? verdict
  })
}
