import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { absolute, isFresh, isProtected, parentDir, parseBranches, targetPath } from './rules'

const isOff = atom({ plugin: 'branch-guard', key: 'isOff' } as const, false)

const TOOLS = ['Edit', 'Write', 'NotebookEdit'] as const

async function git($: EngineInterface, dir: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  const ran = await $.process.run(['git', '-C', dir, ...args]).catch(() => undefined)

  return { ok: ran?.exitCode === 0, out: ran?.stdout.trim() ?? '' }
}

// The closest existing folder of the file (a Write may create new folders).
async function existingDir($: EngineInterface, path: string): Promise<string | null> {
  let dir = parentDir(path)
  for (let i = 0; i < 20 && dir !== null; i++) {
    if (await $.fs.exists(dir).catch(() => false)) return dir
    dir = parentDir(dir)
  }

  return null
}

async function repoRoot($: EngineInterface, dir: string): Promise<string | null> {
  const top = await git($, dir, ['rev-parse', '--show-toplevel'])

  return top.ok && top.out !== '' ? top.out : null
}

async function branchOf($: EngineInterface, cache: Map<string, { branch: string; at: number }>, root: string, dir: string): Promise<string | null> {
  const now = await $.clock.now()
  const hit = cache.get(root)
  if (hit !== undefined && isFresh(hit.at, now)) return hit.branch
  const head = await git($, dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!head.ok) return null
  cache.set(root, { branch: head.out, at: now })

  return head.out
}

// A repo root to ask about, or null when the edit needs no question.
async function mustAsk(
  $: EngineInterface,
  branches: Set<string>,
  cache: Map<string, { branch: string; at: number }>,
  allowed: Set<string>,
  input: unknown,
): Promise<{ path: string; root: string; branch: string } | null> {
  const given = targetPath(input)
  if (given === null) return null
  const path = given.startsWith('/') ? given : absolute(given, await $.session.cwd())
  const dir = await existingDir($, path)
  if (dir === null) return null
  const root = await repoRoot($, dir)
  if (root === null || allowed.has(root)) return null
  const branch = await branchOf($, cache, root, dir)
  if (branch === null || !isProtected(branch, branches)) return null
  if ((await git($, dir, ['check-ignore', '-q', path])).ok) return null

  return { path: given, root, branch }
}

// An asked edit that ran (the user allowed it) opens the whole repo.
function settle<T extends { deny?: unknown; isError?: boolean }>(pending: Map<string, string>, allowed: Set<string>, path: string, ran: T): T {
  const root = pending.get(path)
  if (root !== undefined) {
    pending.delete(path)
    if (ran.deny === undefined && ran.isError !== true) allowed.add(root)
  }

  return ran
}

export const register: Register = (on, options) => {
  const branches = parseBranches(options?.protectedBranches)
  const cache = new Map<string, { branch: string; at: number }>()
  const allowed = new Set<string>()
  const pending = new Map<string, string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'branch-guard',
      description: 'branch-guard on|off|status: ask before editing files on main/master',
    })

    return next(e)
  })

  on('command.run', { command: 'branch-guard' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')
      $.ui.status(arg === 'off' ? 'branch-guard: OFF' : undefined)
    }
    const off = await read($, isOff)

    return { text: `branch-guard is ${off ? 'OFF for this session' : 'ON'}. Protected: ${[...branches].join(', ')}.` }
  })

  for (const tool of TOOLS) {
    on('tool.check', { tool }, async ($, e, next) => {
      const verdict = await next(e)
      if (verdict.decision === 'deny' || (await read($, isOff))) return verdict
      const found = await mustAsk($, branches, cache, allowed, e.input)
      if (found === null) return verdict
      pending.set(found.path, found.root)

      return {
        decision: 'ask',
        reason: `branch-guard: this edits a file on ${found.branch}. Confirm if the user wants changes there; it will not ask again for this repo in this session. If refused, ask the user to switch branch or stop the checks with /branch-guard off.`,
      }
    })
  }

  on('tool.call', { tool: 'Edit' }, async (_$, e, next) => settle(pending, allowed, e.file_path, await next(e)))
  on('tool.call', { tool: 'Write' }, async (_$, e, next) => settle(pending, allowed, e.file_path, await next(e)))
  on('tool.call', { tool: 'NotebookEdit' }, async (_$, e, next) => settle(pending, allowed, e.notebook_path, await next(e)))
}
