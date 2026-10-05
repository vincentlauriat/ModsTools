import type { EngineInterface, Register } from 'claude-code'

import { asHaiku, commitDir, modelPrompt, parseShow, resolveDir, templateHaiku } from './haiku'
import type { Commit } from './haiku'

const OFF = 'off'
const LAST = 'last'
const MODEL_TIMEOUT_MS = 8000

type Last = { hash: string; subject: string; lines: string[]; source: 'model' | 'template' }

async function git($: EngineInterface, dir: string, args: string[]): Promise<string | null> {
  try {
    const ran = await $.process.run(['git', '-C', dir, ...args], { timeoutMs: 5000 })

    return ran.exitCode === 0 ? ran.stdout : null
  } catch {
    return null
  }
}

async function headOf($: EngineInterface, dir: string): Promise<string | null> {
  return (await git($, dir, ['rev-parse', '--verify', '-q', 'HEAD']))?.trim() ?? null
}

async function compose($: EngineInterface, c: Commit): Promise<Last> {
  try {
    const r = await $.model.complete({ model: 'haiku', prompt: modelPrompt(c), maxTokens: 120, effort: 'low', timeoutMs: MODEL_TIMEOUT_MS })
    const lines = r.isAnswered ? asHaiku(r.text) : null
    if (lines !== null) return { hash: c.hash, subject: c.subject, lines, source: 'model' }
  } catch {
    // The engine refused to send the request (model blocked): fall back.
  }

  return { hash: c.hash, subject: c.subject, lines: templateHaiku(c), source: 'template' }
}

// Reads the new commit and toasts its haiku; a commit happened only if HEAD moved
// (no reliance on git's localised messages). Never throws: it runs detached.
async function celebrate($: EngineInterface, path: string, before: string | null): Promise<void> {
  try {
    const show = await git($, path, ['show', '--numstat', '--format=%H%n%s', 'HEAD'])
    const commit = show === null ? null : parseShow(show)
    if (commit === null || commit.hash === before) return
    const last = await compose($, commit)
    await $.store.set(LAST, last)
    $.ui.toast(last.lines.join('\n'), { timeoutMs: 8000 })
  } catch {
    // Store or toast refused: nothing to show.
  }
}

function isLast(v: unknown): v is Last {
  const l = v as Last | null
  return l !== null && typeof l === 'object' && typeof l.hash === 'string' && Array.isArray(l.lines) && l.lines.every(x => typeof x === 'string')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'haiku-commit', description: 'Show the last commit haiku: [on|off]' })

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.agentId !== undefined || !/\bcommit\b/.test(e.command)) return next(e)
    const dir = commitDir(e.command)
    if (dir === undefined || dir.startsWith('~') || (await $.store.get(OFF)) === true) return next(e)
    const path = resolveDir(dir, await $.session.cwd())
    const before = await headOf($, path)
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    // The haiku (git show, a model call of up to 8 s) is written after the tool result is back.
    $.clock.after(0, () => void celebrate($, path, before))

    return ran
  })

  on('command.run', { command: 'haiku-commit' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'on') {
      await $.store.set(OFF, arg === 'off')

      return { text: `haiku-commit is ${arg === 'off' ? 'OFF' : 'ON'}.` }
    }
    if (arg !== '') return { text: 'Usage: /haiku-commit [on|off]' }
    const last = await $.store.get(LAST)
    const off = (await $.store.get(OFF)) === true ? '\n(haiku-commit is OFF)' : ''
    if (!isLast(last)) return { text: `No commit haiku yet.${off}` }

    return { text: `${last.lines.join('\n')}\n\n— ${last.hash.slice(0, 7)} ${last.subject} (${last.source === 'model' ? 'written by a model' : 'from templates'})${off}` }
  })
}
