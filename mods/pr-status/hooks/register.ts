import type { EngineInterface, Register } from 'claude-code'

import { FIELDS, isStale, parse, statusLine, summary, touchesPr } from './pr'
import type { Pr } from './pr'

const TIMEOUT_MS = 10_000

async function fetchPr($: EngineInterface): Promise<Pr | null> {
  try {
    const ran = await $.process.run(['gh', 'pr', 'view', '--json', FIELDS], { cwd: await $.session.cwd(), timeoutMs: TIMEOUT_MS })

    return ran.exitCode === 0 ? parse(ran.stdout) : null
  } catch {
    return null
  }
}

async function refresh($: EngineInterface, last: { at?: number }): Promise<Pr | null> {
  last.at = await $.clock.now()
  const pr = await fetchPr($)
  $.ui.status(pr === null ? undefined : statusLine(pr))

  return pr
}

export const register: Register = on => {
  const last: { at?: number } = {}

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pr-status', description: 'Show the current branch pull request: checks, review, failing check names' })
    await refresh($, last)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && isStale(last.at, await $.clock.now())) await refresh($, last)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'Bash' && ran.deny === undefined && ran.isError !== true && touchesPr(e.command)) await refresh($, last)

    return ran
  })

  on('command.run', { command: 'pr-status' }, async $ => {
    const pr = await refresh($, last)

    return { text: pr === null ? 'No pull request for this branch (or gh is unavailable).' : summary(pr) }
  })
}
