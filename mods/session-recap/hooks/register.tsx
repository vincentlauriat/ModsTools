import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Commit, RecapLog } from '../types'
import {
  EMPTY,
  addChecks,
  addCommit,
  addFile,
  addPr,
  checkKinds,
  parseCommit,
  parseLogLine,
  parsePr,
  recap,
  relative,
  resolveDir,
  withOutput,
} from './recap'

const PANE = 'session-recap'
const TITLE = 'Session recap'
const log = atom({ plugin: 'session-recap', key: 'log' } as const, EMPTY)

async function lines($: EngineInterface): Promise<string[]> {
  const usage = await $.session.usage()
  const now = await $.clock.now()
  const data: RecapLog = await read($, log)

  return recap(data, { startedAt: usage.startedAt, ...(usage.cost === undefined ? {} : { usd: usage.cost.usd }) }, now)
}

// The commit just made, read back with `git log`; the `-m` subject when git cannot answer.
async function lastCommit($: EngineInterface, dir: string, fallback: string | undefined): Promise<Commit | null> {
  try {
    const out = await $.process.run(['git', 'log', '-1', '--format=%h %s'], { cwd: dir })
    if (out.exitCode === 0) {
      const commit = parseLogLine(out.stdout)
      if (commit !== null) return commit
    }
  } catch {
    // fall through to the -m subject
  }

  return fallback === undefined ? null : { sha: '', subject: fallback }
}

async function onBash($: EngineInterface, command: string, ok: boolean, output: string): Promise<void> {
  const kinds = checkKinds(command)
  if (kinds.length > 0) await update($, log, l => addChecks(l, kinds, ok))
  if (!ok) return
  const commit = parseCommit(command)
  if (commit !== null) {
    const found = await lastCommit($, resolveDir(commit.dir, await $.session.cwd()), commit.message)
    if (found !== null) await update($, log, l => addCommit(l, found))
  }
  const pr = parsePr(command)
  if (pr !== null) {
    const entry = withOutput(pr, output)
    await update($, log, l => addPr(l, entry))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'recap',
      description: 'Session recap pane: duration, cost, files, commits, PRs, tests (text | close | clear)',
    })

    return next(e)
  })

  on('command.run', { command: 'recap' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'text') return { text: (await lines($)).join('\n') }
    if (arg === 'close' || arg === 'off') {
      await $.ui.close({ id: PANE })
      return { text: 'Session recap pane closed.' }
    }
    if (arg === 'clear') {
      await update($, log, () => EMPTY)
      return { text: 'Session recap cleared.' }
    }
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Session recap pane opened (/recap text prints it as Markdown).' }
  })

  // Main conversation only: subagent tool calls carry an agentId.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined) return ran
    const ok = ran.isError !== true
    if (e.tool === 'Edit' || e.tool === 'Write') {
      if (ok) {
        const path = relative(e.file_path, await $.session.cwd())
        await update($, log, l => addFile(l, path))
      }
    } else if (e.tool === 'NotebookEdit') {
      if (ok) {
        const path = relative(e.notebook_path, await $.session.cwd())
        await update($, log, l => addFile(l, path))
      }
    } else if (e.tool === 'Bash' && e.run_in_background !== true) {
      // A background command returns before it ends: no exit status yet, and a commit may not have landed.
      const stdout = (ran.result as { stdout?: unknown } | undefined)?.stdout
      const output = `${ran.text ?? ''}\n${typeof stdout === 'string' ? stdout : ''}`
      await onBash($, e.command, ok, output)
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const all = await lines($)

    return (
      <Box flexDirection="column">
        {all.map(line =>
          line.startsWith('#') ? <Text bold>{line.replace(/^#+\s*/, '')}</Text> : <Text>{line === '' ? ' ' : line}</Text>,
        )}
      </Box>
    )
  })
}
