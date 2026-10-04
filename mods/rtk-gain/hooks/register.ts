import type { EngineInterface, Register } from 'claude-code'

import { parseGain, statusLine } from './gain'

const REFRESH_MS = 5 * 60_000
const TIMEOUT_MS = 15_000

// stdout of `rtk gain <args>`; null when rtk is missing, times out or fails.
async function rtk($: EngineInterface, args: string[]): Promise<string | null> {
  try {
    const ran = await $.process.run(['rtk', 'gain', ...args], { timeoutMs: TIMEOUT_MS })

    return ran.exitCode === 0 ? ran.stdout : null
  } catch {
    return null
  }
}

async function refresh($: EngineInterface) {
  const stdout = await rtk($, ['--format', 'json'])
  const gain = stdout === null ? null : parseGain(stdout)
  $.ui.status(gain === null ? undefined : statusLine(gain))
}

export const register: Register = on => {
  let lastAt: number | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'rtk-gain', description: 'Show the RTK token savings summary' })
    lastAt = await $.clock.now()
    await refresh($)

    return next(e)
  })

  on('command.run', { command: 'rtk-gain' }, async $ => {
    lastAt = await $.clock.now()
    await refresh($)
    const text = await rtk($, [])

    return { text: text === null || text.trim() === '' ? 'rtk gain is unavailable (rtk missing or failed).' : text.trim() }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      if (lastAt === null || now - lastAt >= REFRESH_MS) {
        lastAt = now
        await refresh($)
      }
    }

    return next(e)
  })
}
