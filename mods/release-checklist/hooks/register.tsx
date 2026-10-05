import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Report } from '../types'
import { REMINDER, isReleaseRun, row, runChecks, summary } from './checks'
import type { Inputs } from './checks'

const PANE = 'release-checklist'
const TITLE = 'Release checklist'
const report = atom({ plugin: 'release-checklist', key: 'report' } as const, null)

async function file($: EngineInterface, cwd: string, name: string): Promise<string | null> {
  try {
    return await $.fs.read(`${cwd}/${name}`)
  } catch {
    return null
  }
}

async function run($: EngineInterface, cwd: string, argv: string[]): Promise<string | null> {
  try {
    const ran = await $.process.run(argv, { cwd, timeoutMs: 15_000 })
    return ran.exitCode === 0 ? ran.stdout : null
  } catch {
    return null
  }
}

async function gather($: EngineInterface, version: string): Promise<Inputs> {
  const cwd = await $.session.cwd()

  return {
    version,
    project: await file($, cwd, 'project.yml'),
    release: await file($, cwd, 'Scripts/release.sh'),
    gitignore: await file($, cwd, '.gitignore'),
    identities: await run($, cwd, ['security', 'find-identity', '-v', '-p', 'codesigning']),
    porcelain: await run($, cwd, ['git', 'status', '--porcelain']),
    branch: await run($, cwd, ['git', 'rev-parse', '--abbrev-ref', 'HEAD']),
    changes: await file($, cwd, 'CHANGES.md'),
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'release-checklist',
      description: 'Run the pre-release checks of this macOS project in a pane ([version] | close)',
    })

    return next(e)
  })

  on('command.run', { command: 'release-checklist' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'close' || arg === 'off') {
      await $.ui.close({ id: PANE })
      return { text: 'Release checklist closed.' }
    }
    const next: Report = { version: arg, checks: runChecks(await gather($, arg)) }
    await update($, report, () => next)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: `Release checklist: ${summary(next.checks)}.` }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (isReleaseRun(e.command) && ran.deny === undefined && ran.isError !== true) $.ui.toast(REMINDER, { timeoutMs: 15_000 })

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const current: Report | null = await read($, report)
    if (current === null) return <Text dimColor>Run /release-checklist [version].</Text>

    return (
      <Box flexDirection="column">
        <Text bold>{current.version === '' ? summary(current.checks) : `${current.version} · ${summary(current.checks)}`}</Text>
        {current.checks.map(check => (
          <Text dimColor={check.state === 'skip'}>{row(check, e.props.bodyColumns)}</Text>
        ))}
      </Box>
    )
  })
}
