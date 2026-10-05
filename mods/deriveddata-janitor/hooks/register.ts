import type { EngineInterface, Register } from 'claude-code'

import { DERIVED_SUBPATH, isCacheName, isJudgeable, isSafeTarget, parseDuKb, parseWorkspacePath, report, statusLine, totalKb, formatKb } from './janitor'
import type { Orphan } from './janitor'

const QUICK_MS = 10_000
const DU_MS = 20_000
const RM_MS = 120_000
const WORKTREE_REMOVE = /\bgit\s+(?:-C\s+\S+\s+)?worktree\s+remove\b/

// Orphans seen by the last scan, to tell new ones after a `git worktree remove`.
let known = new Set<string>()

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

// Folders under the root whose info.plist names a workspace that no longer exists.
async function scan($: EngineInterface, root: string): Promise<Orphan[]> {
  const entries = await $.fs.list(root).catch(() => [])
  const found: Orphan[] = []
  for (const entry of entries) {
    if (entry.kind !== 'dir' || isCacheName(entry.name)) continue
    const path = `${root}/${entry.name}`
    const workspace = await workspaceOf($, path)
    if (workspace === null || !isJudgeable(workspace) || (await $.fs.exists(workspace).catch(() => true))) continue
    found.push({ name: entry.name, path, workspace, kb: await sizeKb($, path) })
  }

  return found
}

async function refresh($: EngineInterface): Promise<Orphan[]> {
  const root = await derivedRoot($)
  const orphans = root === null ? [] : await scan($, root).catch(() => [])
  known = new Set(orphans.map(o => o.path))
  $.ui.status(statusLine(orphans))

  return orphans
}

async function clean($: EngineInterface): Promise<string> {
  const root = await derivedRoot($)
  if (root === null) return 'HOME is not set: cannot locate DerivedData.'
  const fresh = await scan($, root).catch(() => [])
  let freed = 0
  let removed = 0
  const skipped: string[] = []
  for (const orphan of fresh) {
    const workspace = await workspaceOf($, orphan.path)
    const stillGone = workspace !== null && isJudgeable(workspace) && !(await $.fs.exists(workspace).catch(() => true))
    if (!isSafeTarget(root, orphan.path) || !stillGone) {
      skipped.push(orphan.name)
      continue
    }
    try {
      await $.process.run(['rm', '-rf', orphan.path], { timeoutMs: RM_MS })
    } catch {
      skipped.push(orphan.name)
      continue
    }
    if (await $.fs.exists(orphan.path).catch(() => true)) skipped.push(orphan.name)
    else {
      removed += 1
      freed += orphan.kb
    }
  }
  await refresh($)
  const head = removed === 0 ? 'Nothing deleted.' : `Deleted ${removed} orphan folder${removed === 1 ? '' : 's'}, freed ${formatKb(freed)}.`

  return skipped.length === 0 ? head : `${head} Skipped: ${skipped.join(', ')}.`
}

async function afterWorktreeRemove($: EngineInterface) {
  const before = known
  const orphans = await refresh($)
  const added = orphans.filter(o => !before.has(o.path))
  if (added.length > 0) $.ui.toast(`DerivedData: ${added.length} new orphan${added.length === 1 ? '' : 's'} (${formatKb(totalKb(added))}) — /deriveddata-janitor clean`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'deriveddata-janitor',
      description: 'List (status) or delete (clean) Xcode DerivedData folders whose workspace is gone',
    })
    $.clock.after(0, () => void refresh($))

    return next(e)
  })

  on('command.run', { command: 'deriveddata-janitor' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'clean') return { text: await clean($) }
    if (arg !== '' && arg !== 'status') return { text: 'Usage: /deriveddata-janitor [status|clean]' }
    const root = await derivedRoot($)
    if (root === null) return { text: 'HOME is not set: cannot locate DerivedData.' }

    return { text: report(await refresh($)) }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true && WORKTREE_REMOVE.test(e.command)) {
      await afterWorktreeRemove($).catch(() => undefined)
    }

    return ran
  })
}
