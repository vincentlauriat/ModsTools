import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { check, mentionsPush, pushDir } from './rules'

const isOff = atom({ plugin: 'main-guard', key: 'isOff' } as const, false)

async function currentBranch($: EngineInterface, dir: string | undefined): Promise<string | undefined> {
  const ran = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], dir === undefined ? undefined : { cwd: dir })

  return ran.exitCode === 0 ? ran.stdout.trim() : undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'main-guard',
      description: 'main-guard on|off|status: allow or refuse pushes to main, force pushes, tags and releases',
    })

    return next(e)
  })

  on('command.run', { command: 'main-guard' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')
      $.ui.status(arg === 'off' ? 'main-guard: OFF' : undefined)
    }
    const off = await read($, isOff)

    return { text: `main-guard is ${off ? 'OFF for this session' : 'ON'}.` }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (await read($, isOff)) return next(e)
    const branch = mentionsPush(e.command) ? await currentBranch($, pushDir(e.command)) : undefined
    const reason = check(e.command, branch)
    if (reason === null) return next(e)
    $.ui.toast(`main-guard blocked: ${reason}`)

    return {
      deny:
        `main-guard: refused (${reason}). The project rules forbid this without the user's explicit approval. ` +
        'Ask the user first; they can run it themselves with "! <command>" or allow it for this session with /main-guard off.',
    }
  })
}
