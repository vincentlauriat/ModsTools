import type { EngineInterface, Register } from 'claude-code'

import { classify, countUntracked, gitGrepScope, untrackedFinding } from './probes'
import type { Finding } from './probes'

const KEEP = 10

type Seen = Finding & { command: string }

const short = (command: string) => {
  const line = command.replace(/\s+/g, ' ').trim()

  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

// After a `git grep` that matched nothing: untracked files in its path were never searched.
async function untrackedAfterGitGrep($: EngineInterface, command: string, result: unknown): Promise<Finding | null> {
  const scope = gitGrepScope(command)
  const stdout = typeof result === 'object' && result !== null ? (result as { stdout?: unknown }).stdout : undefined
  if (scope === null || (typeof stdout === 'string' && stdout.trim() !== '')) return null
  try {
    const argv = ['git', 'status', '--porcelain', '--untracked-files=all', ...(scope.pathspecs.length > 0 ? ['--', ...scope.pathspecs] : [])]
    const status = await $.process.run(argv, { ...(scope.dir === null ? {} : { cwd: scope.dir }), timeoutMs: 5000 })
    const count = status.exitCode === 0 ? countUntracked(status.stdout) : 0

    return count > 0 ? untrackedFinding(count) : null
  } catch {
    return null
  }
}

export const register: Register = on => {
  let isEnabled = true
  let turnIds = new Set<string>()
  const recent: Seen[] = []

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'probe-check',
      description: 'Misleading verification probes (list | off | on)',
    })

    return next(e)
  })

  on('command.run', { command: 'probe-check' }, ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      isEnabled = arg === 'on'
      return { text: `probe-check is ${arg}.` }
    }
    if (recent.length === 0) return { text: `probe-check is ${isEnabled ? 'on' : 'off'}. No misleading probe found yet.` }

    return { text: [`probe-check is ${isEnabled ? 'on' : 'off'}. Last ${recent.length} finding(s), newest first:`, ...recent.map(f => `- [${f.id}] ${f.message} (${f.command})`)].join('\n') }
  })

  on('prompt.submit', ($, e, next) => {
    turnIds = new Set()

    return next(e)
  })

  // Records findings and returns those not yet shown this turn.
  const fresh = (findings: Finding[], command: string): Finding[] =>
    findings.filter(finding => {
      recent.unshift({ ...finding, command: short(command) })
      recent.length = Math.min(recent.length, KEEP)
      if (turnIds.has(finding.id)) return false
      turnIds.add(finding.id)

      return true
    })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const isActive = isEnabled && e.agentId === undefined
    if (isActive) for (const finding of fresh(classify(e.command), e.command)) $.ui.toast(`probe-check: ${finding.message}`)
    const ran = await next(e)
    if (isActive && ran.deny === undefined) {
      const found = await untrackedAfterGitGrep($, e.command, ran.result)
      if (found !== null) for (const finding of fresh([found], e.command)) $.ui.toast(`probe-check: ${finding.message}`)
    }

    return ran
  })
}
