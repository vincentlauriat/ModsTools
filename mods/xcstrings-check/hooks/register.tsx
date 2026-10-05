import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { CatalogReport } from '../types'
import {
  CATALOG_SUFFIX,
  analyze,
  ancestors,
  catalogLines,
  dirName,
  isCatalog,
  isProjectMarker,
  isWalked,
  join,
  parseLanguages,
  shown,
  statusText,
} from './catalog'

const PANE = 'xcstrings-check'
const TITLE = 'String Catalogs'
const DEBOUNCE_MS = 2000
const MAX_DEPTH = 8
const MAX_DIRS = 2000

const reports = atom({ plugin: 'xcstrings-check', key: 'reports' } as const, {})
const projects = atom({ plugin: 'xcstrings-check', key: 'projects' } as const, [])

// Edited files since the last flush, the debounce timer, catalogs found per project, checks in flight.
const pending = new Set<string>()
let timer: Timer | undefined
const catalogsOf = new Map<string, string[]>()
const running = new Set<string>()
const again = new Set<string>()

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get('enabled').catch(() => undefined)) !== false
}

// The closest folder at or above `dir` holding .git, project.yml, Package.swift or an Xcode project; else `dir`.
async function projectRoot($: EngineInterface, dir: string): Promise<string> {
  for (const folder of ancestors(dir)) {
    const names = (await $.fs.list(folder).catch(() => [])).map(entry => entry.name)
    if (names.some(isProjectMarker)) return folder
  }

  return dir
}

// The .xcstrings files under `root`, skipping hidden, build and dependency folders.
async function findCatalogs($: EngineInterface, root: string): Promise<string[]> {
  const found: string[] = []
  let queue = [root]
  let seen = 0
  for (let depth = 0; depth <= MAX_DEPTH && queue.length > 0 && seen < MAX_DIRS; depth++) {
    const next: string[] = []
    for (const dir of queue) {
      if (++seen > MAX_DIRS) break
      for (const entry of await $.fs.list(dir).catch(() => [])) {
        const path = join(dir, entry.name)
        if (entry.kind === 'file' && isCatalog(entry.name)) found.push(path)
        else if (entry.kind === 'dir' && isWalked(entry.name)) next.push(path)
      }
    }
    queue = next
  }

  return found.sort()
}

async function catalogs($: EngineInterface, root: string, isFresh: boolean): Promise<string[]> {
  const known = catalogsOf.get(root)
  if (known !== undefined && !isFresh) return known
  const found = await findCatalogs($, root)
  catalogsOf.set(root, found)

  return found
}

async function readCatalog($: EngineInterface, path: string, root: string, cwd: string, expected: readonly string[]): Promise<CatalogReport> {
  const base = { path, shown: shown(path, cwd), root }
  try {
    return { ...base, ...analyze(await $.fs.read(path), expected) }
  } catch {
    return { ...base, sourceLanguage: null, total: 0, languages: [], stale: [], unreadable: 'cannot be read (missing, or over 4 MiB)' }
  }
}

async function showStatus($: EngineInterface) {
  $.ui.status(statusText(Object.values(await read($, reports))))
}

// One check at a time per project; a request meanwhile runs once more after it.
async function checkProject($: EngineInterface, root: string, expected: readonly string[]): Promise<void> {
  if (running.has(root)) {
    again.add(root)
    return
  }
  running.add(root)
  try {
    const cwd = await $.session.cwd().catch(() => '/')
    const done: CatalogReport[] = []
    for (const path of catalogsOf.get(root) ?? []) done.push(await readCatalog($, path, root, cwd, expected))
    await update($, reports, all => ({
      ...Object.fromEntries(Object.entries(all).filter(([, one]) => one.root !== root)),
      ...Object.fromEntries(done.map(one => [one.path, one])),
    }))
    await update($, projects, list => (list.includes(root) ? list : [...list, root]))
    await showStatus($)
  } finally {
    running.delete(root)
  }
  if (again.delete(root)) await checkProject($, root, expected)
}

async function flush($: EngineInterface, expected: readonly string[]): Promise<void> {
  timer = undefined
  const files = [...pending]
  pending.clear()
  if (files.length === 0 || !(await isEnabled($))) return
  const roots = new Set<string>()
  for (const file of files) {
    const root = await projectRoot($, dirName(file))
    const list = await catalogs($, root, false)
    if (isCatalog(file) && !list.includes(file)) catalogsOf.set(root, [...list, file].sort())
    if ((catalogsOf.get(root) ?? []).length > 0) roots.add(root)
  }
  for (const root of roots) await checkProject($, root, expected)
}

function schedule($: EngineInterface, expected: readonly string[]) {
  timer?.cancel()
  timer = $.clock.after(DEBOUNCE_MS, () => void flush($, expected))
}

async function summary($: EngineInterface): Promise<string> {
  const all = Object.values(await read($, reports))
  if (all.length === 0) return 'No String Catalog checked yet (/xcstrings check).'
  const text = statusText(all)
  const count = `${all.length} catalog${all.length === 1 ? '' : 's'}`

  return text === undefined ? `${count}: every translation complete.` : `${count}: ${text}`
}

export const register: Register = (on, options) => {
  const expected = parseLanguages(options?.languages)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'xcstrings',
      description: 'String Catalog translations pending per language, in a pane (check | off | on)',
    })

    return next(e)
  })

  on('command.run', { command: 'xcstrings' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await $.store.set('enabled', arg === 'on')
      if (arg === 'off') {
        timer?.cancel()
        timer = undefined
        pending.clear()
        $.ui.status(undefined)
      } else await showStatus($)
      return { text: `xcstrings-check is ${arg}.` }
    }
    if (arg === 'check') {
      let roots = await read($, projects)
      if (roots.length === 0) roots = [await projectRoot($, await $.session.cwd().catch(() => '/'))]
      for (const root of roots) {
        await catalogs($, root, true)
        await checkProject($, root, expected)
      }
      return { text: await summary($) }
    }
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: await summary($) }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || (e.tool !== 'Edit' && e.tool !== 'Write')) return ran
    if (ran.deny !== undefined || ran.isError === true) return ran
    if (!e.file_path.endsWith('.swift') && !e.file_path.endsWith(CATALOG_SUFFIX)) return ran
    pending.add(e.file_path)
    schedule($, expected)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const all = Object.values(await read($, reports)).sort((a, b) => a.shown.localeCompare(b.shown))
    const lines = all.flatMap(catalogLines)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)
    const color = { title: undefined, ok: 'green', pending: 'yellow', dim: undefined } as const

    return (
      <Box flexDirection="column">
        {all.length === 0 && <Text dimColor>No String Catalog checked yet: /xcstrings check</Text>}
        {lines.slice(0, room).map(line => (
          <Text bold={line.tone === 'title'} color={color[line.tone]} dimColor={line.tone === 'dim'}>
            {`${'  '.repeat(line.depth)}${line.text}`}
          </Text>
        ))}
        {lines.length > room && <Text dimColor>… {lines.length - room} more lines</Text>}
      </Box>
    )
  })
}
