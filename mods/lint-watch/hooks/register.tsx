import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { FileResult, LinterName } from '../types'
import {
  EXECUTABLE,
  LINTERS,
  ROOTS,
  ancestors,
  argv,
  dirName,
  fileResult,
  issueLine,
  join,
  linterFor,
  linterSummary,
  newlyFailing,
  parseReport,
  shown,
  statusText,
  toastText,
} from './lint'

const PANE = 'lint-watch'
const TITLE = 'Lint'
const DEBOUNCE_MS = 2000
const LINT_MS = 2 * 60 * 1000
const WHICH_MS = 5000
const MAX_EDITED = 500

const results = atom({ plugin: 'lint-watch', key: 'results' } as const, {})
const edited = atom({ plugin: 'lint-watch', key: 'edited' } as const, [])
const summary = atom({ plugin: 'lint-watch', key: 'summary' } as const, null)

type Group = { key: string; linter: LinterName; root: string; files: string[] }

// Files edited since the last flush, the debounce timer, linter availability, runs in flight.
const pending = new Set<string>()
let timer: Timer | undefined
const available = new Map<LinterName, boolean>()
const running = new Set<string>()
const queued = new Map<string, Group>()

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get('enabled').catch(() => undefined)) !== false
}

// Checked once per linter and module load: `command -v`, through sh since there is no shell.
async function isAvailable($: EngineInterface, linter: LinterName): Promise<boolean> {
  const known = available.get(linter)
  if (known !== undefined) return known
  let found = false
  try {
    const ran = await $.process.run(['/bin/sh', '-c', 'command -v "$1"', 'sh', EXECUTABLE[linter]], { timeoutMs: WHICH_MS })
    found = ran.exitCode === 0 && ran.stdout.trim() !== ''
  } catch {
    found = false
  }
  available.set(linter, found)

  return found
}

async function closest($: EngineInterface, dir: string, names: readonly string[]): Promise<string | null> {
  if (names.length === 0) return null
  for (const folder of ancestors(dir)) {
    for (const name of names) if (await $.fs.exists(join(folder, name)).catch(() => false)) return folder
  }

  return null
}

// The folder the linter runs from, or null when it must not run for this file.
async function rootFor($: EngineInterface, linter: LinterName, file: string): Promise<string | null> {
  const rule = ROOTS[linter]
  const dir = dirName(file)
  const config = await closest($, dir, rule.config)
  if (config !== null || rule.required) return config

  return (await closest($, dir, rule.fallback)) ?? dir
}

async function groupFiles($: EngineInterface, files: readonly string[]): Promise<Group[]> {
  const groups = new Map<string, Group>()
  for (const file of files) {
    const linter = linterFor(file)
    if (linter === null || !(await isAvailable($, linter))) continue
    const root = await rootFor($, linter, file)
    if (root === null) continue
    const key = `${linter}:${root}`
    const group = groups.get(key) ?? { key, linter, root, files: [] }
    if (!group.files.includes(file)) group.files.push(file)
    groups.set(key, group)
  }

  return [...groups.values()]
}

async function lintOnce($: EngineInterface, group: Group): Promise<FileResult[]> {
  const cwd = await $.session.cwd().catch(() => '/')
  const view = (file: string) => shown(file, cwd)
  try {
    const ran = await $.process.run(argv(group.linter, group.files), { cwd: group.root, timeoutMs: LINT_MS })
    const report = parseReport(group.linter, ran.stdout, group.root, group.files)
    if (report === null) {
      return group.files.map(file => fileResult(file, view(file), group.linter, [], `${group.linter} gave no JSON report (exit ${ran.exitCode})`))
    }

    return group.files.map(file => fileResult(file, view(file), group.linter, report.get(file) ?? []))
  } catch {
    return group.files.map(file => fileResult(file, view(file), group.linter, [], `${group.linter} could not run or timed out`))
  }
}

// One run at a time per linter and root; files arriving meanwhile run right after.
async function runGroup($: EngineInterface, group: Group): Promise<FileResult[]> {
  if (running.has(group.key)) {
    const waiting = queued.get(group.key)
    queued.set(group.key, waiting === undefined ? group : { ...waiting, files: [...new Set([...waiting.files, ...group.files])] })
    return []
  }
  running.add(group.key)
  let done: FileResult[]
  try {
    done = await lintOnce($, group)
  } finally {
    running.delete(group.key)
  }
  const next = queued.get(group.key)
  if (next !== undefined) {
    queued.delete(group.key)
    done = [...done, ...(await runGroup($, next))]
  }

  return done
}

async function lintFiles($: EngineInterface, files: readonly string[]): Promise<FileResult[]> {
  const groups = await groupFiles($, files)
  const done = (await Promise.all(groups.map(group => runGroup($, group)))).flat()
  if (done.length === 0) return done
  const before = await read($, results)
  const failing = newlyFailing(before, done)
  await update($, results, all => ({ ...all, ...Object.fromEntries(done.map(one => [one.path, one])) }))
  $.ui.status(statusText(done))
  if (failing.length > 0) $.ui.toast(toastText(failing))

  return done
}

async function flush($: EngineInterface): Promise<void> {
  timer = undefined
  const files = [...pending]
  pending.clear()
  if (files.length === 0 || !(await isEnabled($))) return
  await update($, edited, list => [...new Set([...list, ...files])].slice(-MAX_EDITED))
  await lintFiles($, files)
}

async function detect($: EngineInterface): Promise<string> {
  const found = {} as Record<LinterName, boolean>
  for (const linter of LINTERS) found[linter] = await isAvailable($, linter)
  const cwd = await $.session.cwd().catch(() => '/')
  const hasProjectEslint = found.eslint && (await closest($, cwd, ROOTS.eslint.config)) !== null
  const text = linterSummary(found, hasProjectEslint)
  await update($, summary, () => text)

  return text
}

function schedule($: EngineInterface) {
  timer?.cancel()
  timer = $.clock.after(DEBOUNCE_MS, () => void flush($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lint-watch',
      description: 'Lint issues of the files Claude edited, in a pane (off | on | run)',
    })

    return next(e)
  })

  on('command.run', { command: 'lint-watch' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await $.store.set('enabled', arg === 'on')
      if (arg === 'off') {
        timer?.cancel()
        timer = undefined
        pending.clear()
        $.ui.status(undefined)
      }
      return { text: `lint-watch is ${arg}.` }
    }
    if (arg === 'run') {
      const files = await read($, edited)
      if (files.length === 0) return { text: 'No file edited this session yet.' }
      const done = await lintFiles($, files)
      if (done.length === 0) return { text: `No linter for the ${files.length} edited file${files.length === 1 ? '' : 's'}. ${await detect($)}` }

      return { text: `${statusText(done)} over ${done.length} file${done.length === 1 ? '' : 's'}.` }
    }
    const text = await detect($)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: `lint-watch is ${(await isEnabled($)) ? 'on' : 'off'}. ${text}` }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || (e.tool !== 'Edit' && e.tool !== 'Write')) return ran
    if (ran.deny !== undefined || ran.isError === true || linterFor(e.file_path) === null) return ran
    pending.add(e.file_path)
    schedule($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const all = Object.values(await read($, results)).sort((a, b) => a.shown.localeCompare(b.shown))
    const header = await read($, summary)
    const lines: { text: string; color?: string; dim?: boolean }[] = []
    for (const one of all) {
      if (one.failure !== undefined) lines.push({ text: `${one.shown}: ${one.failure}`, dim: true })
      for (const issue of one.issues) lines.push({ text: issueLine(one, issue), color: issue.severity === 'error' ? 'red' : 'yellow' })
      const hidden = one.errors + one.warnings - one.issues.length
      if (hidden > 0) lines.push({ text: `${one.shown}: ${hidden} more`, dim: true })
    }
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 5)
    const shownLines = lines.slice(0, room)

    return (
      <Box flexDirection="column">
        {header !== null && <Text dimColor>{header}</Text>}
        <Text bold>{all.length === 0 ? 'No lint results yet.' : `${statusText(all)} · ${all.length} file${all.length === 1 ? '' : 's'}`}</Text>
        {shownLines.map(line => (
          <Text color={line.color} dimColor={line.dim === true}>
            {line.text}
          </Text>
        ))}
        {lines.length > room && <Text dimColor>… {lines.length - room} more lines</Text>}
      </Box>
    )
  })
}
