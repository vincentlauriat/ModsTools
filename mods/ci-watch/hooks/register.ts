import type { EngineInterface, Register } from 'claude-code'

import { RUN_FIELDS, allDone, finalToast, githubRepo, isUrl, parsePush, parseRuns, resolveDir, runLine, shortSha, statusLine } from './ci'
import type { Push, Run } from './ci'

const POLL_MS = 30_000
const APPEAR_MS = 2 * 60_000
const MAX_MS = 45 * 60_000
const KEEP_MS = 10 * 60_000
const GH_MS = 20_000
const GIT_MS = 10_000

type Timer = { cancel: () => void }

type Watch = {
  sha: string
  branch: string
  repo: string
  dir: string
  startedAt: number
  runs: Run[]
  phase: 'waiting' | 'running' | 'done' | 'no workflow' | 'stopped' | 'timed out'
  timer: Timer | null
  clear: Timer | null
  busy: boolean
}

type Ctx = {
  watch: Watch | null
  // Bumped by every push seen: a start that is no longer the latest drops its work.
  seq: number
  // Why nothing is watched, for /ci-watch.
  reason: string | null
}

type Ran = { exitCode: number; stdout: string } | null

async function run($: EngineInterface, argv: string[], cwd: string, timeoutMs: number): Promise<Ran> {
  try {
    const ran = await $.process.run(argv, { cwd, timeoutMs })
    return { exitCode: ran.exitCode, stdout: ran.stdout }
  } catch {
    return null
  }
}

async function git($: EngineInterface, dir: string, args: string[]): Promise<string | null> {
  const ran = await run($, ['git', '-C', dir, ...args], dir, GIT_MS)

  return ran !== null && ran.exitCode === 0 && ran.stdout.trim() !== '' ? ran.stdout.trim() : null
}

async function enabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get('enabled')) !== false
}

const active = (watch: Watch | null): watch is Watch => watch !== null && (watch.phase === 'waiting' || watch.phase === 'running')

function halt(watch: Watch, phase: Watch['phase']) {
  watch.timer?.cancel()
  watch.timer = null
  watch.phase = phase
}

function drop($: EngineInterface, ctx: Ctx) {
  const watch = ctx.watch
  if (watch === null) return
  watch.clear?.cancel()
  watch.clear = null
  if (active(watch)) halt(watch, 'stopped')
  $.ui.status(undefined)
}

async function tick($: EngineInterface, ctx: Ctx, watch: Watch) {
  if (watch.busy || !active(watch)) return
  watch.busy = true
  try {
    const now = await $.clock.now()
    if (now - watch.startedAt >= MAX_MS) {
      halt(watch, 'timed out')
      if (ctx.watch === watch) {
        $.ui.status(undefined)
        $.ui.toast(`CI: stopped watching ${shortSha(watch.sha)} after 45 min`)
      }
      return
    }
    const ran = await run($, ['gh', 'run', 'list', '-R', watch.repo, '--commit', watch.sha, '--json', RUN_FIELDS], watch.dir, GH_MS)
    // A push that replaced this watch, or a stop, while gh ran: its answer is stale.
    if (ctx.watch !== watch || !active(watch)) return
    const runs = ran !== null && ran.exitCode === 0 ? parseRuns(ran.stdout) : null
    if (runs === null) ctx.reason = ran === null ? 'gh run list could not run or timed out' : 'gh run list failed'
    if (runs === null || runs.length === 0) {
      if (watch.runs.length === 0 && now - watch.startedAt >= APPEAR_MS) {
        halt(watch, 'no workflow')
        ctx.reason = `no workflow run for ${shortSha(watch.sha)} after 2 min`
        $.ui.status(undefined)
      }
      return
    }
    ctx.reason = null
    watch.runs = runs
    watch.phase = 'running'
    $.ui.status(statusLine(runs))
    if (allDone(runs)) {
      halt(watch, 'done')
      $.ui.toast(finalToast(runs, watch.branch), { timeoutMs: 8000 })
      watch.clear = $.clock.after(KEEP_MS, () => {
        if (ctx.watch === watch) $.ui.status(undefined)
      })
    }
  } finally {
    watch.busy = false
  }
}

// Everything a push sets off, deferred: git and gh are asked here, never while the tool result waits.
async function startWatch($: EngineInterface, ctx: Ctx, push: Push, seq: number) {
  const latest = () => seq === ctx.seq
  if (!(await enabled($))) return
  const dir = resolveDir(await $.session.cwd(), push.dirs)
  const sha = await git($, dir, ['rev-parse', 'HEAD'])
  const branch = (await git($, dir, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? 'HEAD'
  if (!latest()) return
  if (sha === null) {
    ctx.reason = 'the pushed folder is not a git repository'
    return
  }
  if (active(ctx.watch) && ctx.watch.sha === sha) return
  const remote = push.remote ?? (await git($, dir, ['config', '--get', `branch.${branch}.remote`])) ?? 'origin'
  const url = isUrl(remote) ? remote : await git($, dir, ['remote', 'get-url', '--push', remote])
  const repo = url === null ? null : githubRepo(url)
  if (!latest()) return
  if (repo === null) {
    ctx.reason = `remote ${remote} is not a GitHub repository`
    return
  }
  const auth = await run($, ['gh', 'auth', 'status', '--hostname', 'github.com'], dir, GH_MS)
  if (!latest()) return
  if (auth === null) {
    ctx.reason = 'gh is not installed (or did not answer)'
    return
  }
  if (auth.exitCode !== 0) {
    ctx.reason = 'gh is not authenticated (gh auth login)'
    return
  }
  drop($, ctx)
  ctx.reason = null
  const watch: Watch = { sha, branch, repo, dir, startedAt: await $.clock.now(), runs: [], phase: 'waiting', timer: null, clear: null, busy: false }
  ctx.watch = watch
  watch.timer = $.clock.every(POLL_MS, () => void tick($, ctx, watch))
  await tick($, ctx, watch)
}

function listing(ctx: Ctx, isOn: boolean): string {
  const lines: string[] = []
  if (!isOn) lines.push('ci-watch is off (/ci-watch on to resume).')
  const watch = ctx.watch
  if (watch !== null) {
    lines.push(`${watch.repo} · ${watch.branch} @ ${shortSha(watch.sha)} · ${watch.phase}`)
    lines.push(...watch.runs.map(runLine))
    if (watch.runs.length === 0 && watch.phase === 'waiting') lines.push('Waiting for the first workflow run to appear…')
  }
  if (ctx.reason !== null) lines.push(`Note: ${ctx.reason}.`)
  if (lines.length === 0) lines.push('No push watched this session.')

  return lines.join('\n')
}

export const register: Register = on => {
  const ctx: Ctx = { watch: null, seq: 0, reason: null }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ci-watch', description: 'Show the GitHub Actions runs of the last push (stop | off | on)' })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || e.tool !== 'Bash' || ran.deny !== undefined || ran.isError === true) return ran
    const result = ran.result as { backgroundTaskId?: unknown; interrupted?: unknown } | undefined
    if (result?.backgroundTaskId !== undefined || result?.interrupted === true) return ran
    const push = parsePush(e.command)
    if (push === null) return ran
    ctx.seq += 1
    const seq = ctx.seq
    $.clock.after(0, () => void startWatch($, ctx, push, seq))

    return ran
  })

  on('command.run', { command: 'ci-watch' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'stop') {
      const was = active(ctx.watch)
      drop($, ctx)
      return { text: was ? 'Stopped watching CI.' : 'Nothing was being watched.' }
    }
    if (arg === 'off') {
      await $.store.set('enabled', false)
      ctx.seq += 1
      drop($, ctx)
      return { text: 'ci-watch off: pushes are no longer followed.' }
    }
    if (arg === 'on') {
      await $.store.set('enabled', true)
      return { text: 'ci-watch on: the next push is followed.' }
    }

    return { text: listing(ctx, await enabled($)) }
  })
}
