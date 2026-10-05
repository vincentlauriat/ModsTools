import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { DEFAULT_MAX_HEADER, TYPES, commitMessages, firstLine, lint, resolveFile } from './rules'
import type { CommitInfo } from './rules'

const isOff = atom({ plugin: 'commit-lint', key: 'isOff' } as const, false)

async function subjectOf($: EngineInterface, info: CommitInfo): Promise<string | null> {
  if (info.subject !== null) return info.subject
  if (info.file === null || info.file === '-') return null
  const text = await $.fs.read(resolveFile(info.file, info.dir, await $.session.cwd())).catch(() => null)

  return typeof text === 'string' ? firstLine(text) : null
}

async function problem($: EngineInterface, command: string, maxHeader: number): Promise<string | null> {
  for (const info of commitMessages(command)) {
    const subject = await subjectOf($, info)
    const reason = subject === null ? null : lint(subject, maxHeader)
    if (reason !== null) return reason
  }

  return null
}

export const register: Register = (on, options) => {
  const maxHeader = typeof options?.maxHeader === 'number' && options.maxHeader > 0 ? options.maxHeader : DEFAULT_MAX_HEADER

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'commit-lint',
      description: 'commit-lint on|off|status: refuse commit messages that are not Conventional Commits',
    })

    return next(e)
  })

  on('command.run', { command: 'commit-lint' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')
      $.ui.status(arg === 'off' ? 'commit-lint: OFF' : undefined)
    }
    const off = await read($, isOff)

    return { text: `commit-lint is ${off ? 'OFF for this session' : 'ON'}. Header max: ${maxHeader} characters.` }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!/\bcommit\b/.test(e.command) || (await read($, isOff))) return next(e)
    const reason = await problem($, e.command, maxHeader)
    if (reason === null) return next(e)
    $.ui.toast(`commit-lint blocked: ${reason}`)

    return {
      deny:
        `commit-lint: refused, ${reason}. Expected "type(scope)?!?: subject" with type one of ${TYPES.join(', ')}, ` +
        `header up to ${maxHeader} characters, e.g. "feat(api): add retry". Fix the message and run the commit again, or stop the checks with /commit-lint off.`,
    }
  })
}
