import type { EngineInterface, Register } from 'claude-code'

import {
  MB,
  addArgs,
  artifactOf,
  askReason,
  commitArgs,
  gitRuns,
  offenders,
  parseMaxMb,
  parseNulList,
  parseNumstat,
  parseSize,
  relativeTo,
  resolvePath,
  wholeEntries,
  withTruncation,
} from './rules'
import type { Candidate, Changed, GitRun, Offender } from './rules'

const GIT_MS = 5_000
const OFF = 'off'
// Untracked files sized one by one past this many are left unsized (an un-ignored node_modules can hold thousands).
const MAX_STATS = 500
const MAX_CAT_FILE = 5

class GitFailed extends Error {}

// Set when a git listing went past what one process run keeps (4 MiB of stdout).
type Seen = { truncated: boolean }

// One git call; any failure (cannot start, timeout, non-zero exit) throws so the engine's verdict stands.
// A cut-off `-z` listing is kept up to its last whole entry and noted in `seen`.
async function git($: EngineInterface, dir: string, args: string[], seen?: Seen): Promise<string> {
  let ran
  try {
    ran = await $.process.run(['git', '-C', dir, ...args], { timeoutMs: GIT_MS })
  } catch {
    throw new GitFailed('git unavailable')
  }
  if (ran.exitCode !== 0) throw new GitFailed(`git ${args[0]} failed`)
  if (!ran.isStdoutTruncated) return ran.stdout
  if (seen === undefined) throw new GitFailed(`git ${args[0]} output cut off`)
  seen.truncated = true

  return wholeEntries(ran.stdout)
}

async function rootOf($: EngineInterface, dir: string): Promise<string> {
  const top = (await git($, dir, ['rev-parse', '--show-toplevel'])).trim()
  if (!top.startsWith('/')) throw new GitFailed('no repository root')

  return top
}

async function worktreeSize($: EngineInterface, root: string, path: string): Promise<number | null> {
  const stat = await $.fs.stat(`${root}/${path}`).catch(() => null)

  return stat !== null && stat.kind === 'file' ? stat.size : null
}

// Sizes the files: from the working tree, else the staged blob (`git cat-file -s :path`) for a few.
async function sized($: EngineInterface, root: string, files: readonly Changed[], useIndex: boolean): Promise<Candidate[]> {
  const out: Candidate[] = []
  let stats = 0
  let catFiles = 0
  for (const file of files) {
    let size: number | null = null
    if (stats < MAX_STATS) {
      stats += 1
      size = await worktreeSize($, root, file.path)
    }
    if (size === null && useIndex && catFiles < MAX_CAT_FILE) {
      catFiles += 1
      size = parseSize(await git($, root, ['cat-file', '-s', `:${file.path}`]).catch(() => ''))
    }
    out.push({ path: file.path, size, binary: file.binary })
  }

  return out
}

function merge(lists: readonly Changed[][]): Changed[] {
  const byPath = new Map<string, Changed>()
  for (const list of lists) for (const one of list) byPath.set(one.path, { path: one.path, binary: one.binary || (byPath.get(one.path)?.binary ?? false) })

  return [...byPath.values()]
}

const NUMSTAT = ['--numstat', '-z', '--no-renames', '--diff-filter=d']

async function commitOffenders($: EngineInterface, run: GitRun, cwd: string, maxBytes: number): Promise<Offender[]> {
  const opts = commitArgs(run.args)
  if (opts.dryRun) return []
  const dir = resolvePath(run.dir ?? '.', cwd)
  const root = await rootOf($, dir)
  const seen: Seen = { truncated: false }
  const lists = [parseNumstat(await git($, dir, ['diff', '--cached', ...NUMSTAT], seen))]
  if (opts.all) lists.push(parseNumstat(await git($, dir, ['diff', ...NUMSTAT], seen)))

  return withTruncation(offenders(await sized($, root, merge(lists), true), maxBytes), seen.truncated)
}

async function addOffenders($: EngineInterface, run: GitRun, cwd: string, maxBytes: number): Promise<Offender[]> {
  const opts = addArgs(run.args)
  if (opts.dryRun || (opts.paths.length === 0 && !opts.all && !opts.update)) return []
  const dir = resolvePath(run.dir ?? '.', cwd)
  const root = await rootOf($, dir)
  const specs = opts.paths.length > 0 ? opts.paths : [':/']
  // Paths named on the line, as given, even when ignored (`git add -f`).
  const named: Changed[] = []
  for (const given of opts.paths) {
    const rel = relativeTo(resolvePath(given, dir), root)
    if (rel !== null && rel !== '' && !/[*?[]/.test(given) && artifactOf(rel) !== null) named.push({ path: rel, binary: false })
  }
  const seen: Seen = { truncated: false }
  const tracked = parseNumstat(await git($, dir, ['diff', ...NUMSTAT, '--', ...specs], seen))
  const untracked = opts.update
    ? []
    : parseNulList(await git($, dir, ['ls-files', '--others', '--exclude-standard', '--full-name', '-z', '--', ...specs], seen)).map(path => ({ path, binary: false }))

  return withTruncation(offenders(await sized($, root, merge([named, tracked, untracked]), false), maxBytes), seen.truncated)
}

async function inspect($: EngineInterface, command: string, maxBytes: number): Promise<{ found: Offender[]; verb: 'commit' | 'add' } | null> {
  const runs = gitRuns(command).filter(run => run.sub === 'commit' || run.sub === 'add')
  if (runs.length === 0) return null
  const cwd = await $.session.cwd()
  for (const run of runs) {
    const found = run.sub === 'commit' ? await commitOffenders($, run, cwd, maxBytes) : await addOffenders($, run, cwd, maxBytes)
    if (found.length > 0) return { found, verb: run.sub === 'commit' ? 'commit' : 'add' }
  }

  return null
}

const isOff = async ($: EngineInterface) => (await $.store.get(OFF).catch(() => false)) === true

export const register: Register = (on, options) => {
  const maxMb = parseMaxMb(options?.maxMB)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'commit-size-guard',
      description: 'commit-size-guard on|off|status: ask before committing large files or build artifacts',
    })
    if (await isOff($)) $.ui.status('commit-size-guard: OFF')

    return next(e)
  })

  on('command.run', { command: 'commit-size-guard' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await $.store.set(OFF, arg === 'off')
      $.ui.status(arg === 'off' ? 'commit-size-guard: OFF' : undefined)
    }
    const off = await isOff($)

    return { text: `commit-size-guard is ${off ? 'OFF (kept across sessions)' : 'ON'}. Asks above ${maxMb} MB, for binaries above 1 MB and for build/release artifacts.` }
  })

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const verdict = await next(e)
    const command = (e.input as { command?: unknown }).command
    if (verdict.decision === 'deny' || typeof command !== 'string' || !/\bgit\b/.test(command) || (await isOff($))) return verdict
    let result
    try {
      result = await inspect($, command, maxMb * MB)
    } catch {
      return verdict
    }
    if (result === null) return verdict

    return { decision: 'ask', reason: askReason(result.found, result.verb) }
  })
}
