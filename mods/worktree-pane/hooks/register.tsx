import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DerivedFolder, WorktreeRow } from '../types'
import {
  DERIVED_SUBPATH,
  NOT_A_REPO,
  baseName,
  derivedLabel,
  dirtyCount,
  firstLine,
  isCacheName,
  isSafeTarget,
  ownerOf,
  parseDuKb,
  parsePorcelain,
  parseWorkspacePath,
  removedToast,
  rowLabel,
  totalKb,
} from './worktrees'

const PANE = 'worktree-pane'
const TITLE = 'Worktrees'
const QUICK_MS = 10_000
const DU_MS = 20_000
const RM_MS = 120_000
const rows = atom({ plugin: 'worktree-pane', key: 'rows' } as const, [])
const error = atom({ plugin: 'worktree-pane', key: 'error' } as const, null)
const confirm = atom({ plugin: 'worktree-pane', key: 'confirm' } as const, null)
const notice = atom({ plugin: 'worktree-pane', key: 'notice' } as const, null)

async function derivedRoot($: EngineInterface): Promise<string | null> {
  const home = await $.env.get('HOME')

  return home === undefined || !home.startsWith('/') ? null : `${home.replace(/\/$/, '')}/${DERIVED_SUBPATH}`
}

async function workspaceOf($: EngineInterface, folder: string): Promise<string | null> {
  try {
    const ran = await $.process.run(['plutil', '-extract', 'WorkspacePath', 'raw', '-o', '-', `${folder}/info.plist`], { timeoutMs: QUICK_MS })

    return ran.exitCode === 0 ? parseWorkspacePath(ran.stdout) : null
  } catch {
    return null
  }
}

async function sizeKb($: EngineInterface, folder: string): Promise<number> {
  try {
    const ran = await $.process.run(['du', '-sk', folder], { timeoutMs: DU_MS })

    return ran.exitCode === 0 ? parseDuKb(ran.stdout) : 0
  } catch {
    return 0
  }
}

// DerivedData folders per owning worktree path; folders of no worktree are left out.
async function derivedByWorktree($: EngineInterface, root: string, paths: string[]): Promise<Map<string, DerivedFolder[]>> {
  const found = new Map<string, DerivedFolder[]>()
  const entries = await $.fs.list(root).catch(() => [])
  for (const entry of entries) {
    if (entry.kind !== 'dir' || isCacheName(entry.name)) continue
    const path = `${root}/${entry.name}`
    const workspace = await workspaceOf($, path)
    const owner = workspace === null ? null : ownerOf(workspace, paths)
    if (owner === null) continue
    found.set(owner, [...(found.get(owner) ?? []), { name: entry.name, path, kb: await sizeKb($, path) }])
  }

  return found
}

async function dirtyOf($: EngineInterface, path: string): Promise<number> {
  try {
    const ran = await $.process.run(['git', '-C', path, 'status', '--porcelain'], { timeoutMs: QUICK_MS })

    return ran.exitCode === 0 ? dirtyCount(ran.stdout) : 0
  } catch {
    return 0
  }
}

async function snapshot($: EngineInterface): Promise<{ list: WorktreeRow[]; problem: string | null }> {
  try {
    const ran = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: await $.session.cwd(), timeoutMs: QUICK_MS })
    const entries = ran.exitCode === 0 ? parsePorcelain(ran.stdout) : []
    if (entries.length === 0) return { list: [], problem: NOT_A_REPO }
    const root = await derivedRoot($)
    const derived = root === null ? new Map<string, DerivedFolder[]>() : await derivedByWorktree($, root, entries.map(one => one.path)).catch(() => new Map())
    const list: WorktreeRow[] = []
    for (const [index, entry] of entries.entries()) {
      const missing = !(await $.fs.exists(entry.path).catch(() => true))
      const dirty = missing || entry.bare ? 0 : await dirtyOf($, entry.path)
      list.push({ ...entry, main: index === 0, missing, dirty, derived: derived.get(entry.path) ?? [] })
    }

    return { list, problem: null }
  } catch {
    return { list: [], problem: 'git unavailable' }
  }
}

// Reloads the list; a refresh always resets a pending confirm.
async function refresh($: EngineInterface, message: string | null = null) {
  const { list, problem } = await snapshot($)
  await update($, rows, () => list)
  await update($, error, () => problem)
  await update($, confirm, () => null)
  await update($, notice, () => message)

  return problem
}

// Deletes the worktree's DerivedData folders; only called once git removed the worktree.
async function removeDerived($: EngineInterface, row: WorktreeRow): Promise<{ count: number; kb: number }> {
  const root = await derivedRoot($)
  let count = 0
  let kb = 0
  if (root === null) return { count, kb }
  for (const folder of row.derived) {
    if (!isSafeTarget(root, folder.path) || !(await $.fs.exists(folder.path).catch(() => false))) continue
    const workspace = await workspaceOf($, folder.path)
    if (workspace === null || ownerOf(workspace, [row.path]) === null) continue
    try {
      await $.process.run(['rm', '-rf', folder.path], { timeoutMs: RM_MS })
    } catch {
      continue
    }
    if (!(await $.fs.exists(folder.path).catch(() => true))) {
      count += 1
      kb += folder.kb
    }
  }

  return { count, kb }
}

async function removeWorktree($: EngineInterface, path: string) {
  const row = (await read($, rows)).find(one => one.path === path)
  if (row === undefined || row.main) return
  let failure: string | null = null
  try {
    const ran = await $.process.run(['git', 'worktree', 'remove', path], { cwd: await $.session.cwd(), timeoutMs: RM_MS })
    if (ran.exitCode !== 0) failure = firstLine(ran.stderr === '' ? ran.stdout : ran.stderr)
  } catch {
    failure = 'git unavailable'
  }
  if (failure !== null) {
    await refresh($, `git: ${failure}`)

    return
  }
  const { count, kb } = await removeDerived($, row).catch(() => ({ count: 0, kb: 0 }))
  const message = removedToast(baseName(path), count, kb)
  await refresh($, message)
  $.ui.toast(message)
}

async function pressRemove($: EngineInterface, path: string) {
  if ((await read($, confirm)) === path) await removeWorktree($, path)
  else await update($, confirm, () => path)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'worktrees',
      description: 'Show the git worktrees with their DerivedData in a pane (open | close | refresh)',
    })

    return next(e)
  })

  on('command.run', { command: 'worktrees' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'close' || arg === 'off') {
      await $.ui.close({ id: PANE })
      return { text: 'Worktrees pane closed.' }
    }
    const problem = await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })
    const count = (await read($, rows)).length

    return { text: problem ?? `Worktrees pane ${arg === 'refresh' ? 'refreshed' : 'opened'} (${count} worktree${count === 1 ? '' : 's'}).` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list: WorktreeRow[] = await read($, rows)
    const problem = await read($, error)
    const pending = await read($, confirm)
    const message = await read($, notice)
    const home = (await $.env.get('HOME').catch(() => undefined)) ?? null
    const mainPath = list[0]?.path ?? ''

    if (problem !== null) return <Text dimColor>{problem}</Text>

    return (
      <Box flexDirection="column">
        <Text bold>{`${list.length} worktree${list.length === 1 ? '' : 's'}`}</Text>
        {message !== null && <Text>{message}</Text>}
        {list.map(row => (
          <Box flexDirection="column">
            <Text bold={row.main}>{rowLabel(row, mainPath, home)}</Text>
            {derivedLabel(row) !== null && <Text dimColor>{`  ${derivedLabel(row)}`}</Text>}
            {!row.main && <Button key={`remove:${row.path}`} label={pending === row.path ? 'Confirm remove?' : 'Remove'} onPress={() => pressRemove($, row.path)} />}
          </Box>
        ))}
        <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
      </Box>
    )
  })
}
