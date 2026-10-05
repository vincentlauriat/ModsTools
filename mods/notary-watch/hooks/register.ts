import type { EngineInterface, Register } from 'claude-code'

import { IN_PROGRESS, age, finalToast, isFinal, newSubmissions, parseHistory, parseInfo, parseOutput, parseSubmit, scriptCall, scriptProfile, statusLine, timedOutToast, unpolledToast } from './notary'
import type { ScriptCall } from './notary'

const POLL_MS = 60_000
const INFO_MS = 30_000
const MAX_MS = 2 * 60 * 60_000
const SCRIPT_MAX_MS = 30 * 60_000

type Tracked = {
  id: string
  file: string | null
  status: string
  startedAt: number
  // The auth argv replayed to `notarytool info`: kept in this module's memory only, never stored or shown.
  auth: string[] | null
  polling: boolean
  note: string | null
}

// One run of a release script: where its submissions are looked for in `notarytool history`.
type ScriptRun = {
  name: string
  startedAt: number
  background: boolean
  // The keychain profile `history` is asked with (not a secret: shown in /notary-watch, never in a toast).
  profile: string | null
  from: 'keychainProfile' | 'script' | null
  found: number
  note: string
  timer: { cancel: () => void } | null
  busy: boolean
}

type Watch = {
  tracked: Map<string, Tracked>
  timer: { cancel: () => void } | null
  busy: boolean
  scripts: ScriptRun[]
}

function showStatus($: EngineInterface, watch: Watch) {
  $.ui.status(statusLine([...watch.tracked.values()].filter(one => one.polling)))
}

function stopTimerIfIdle(watch: Watch) {
  if (watch.timer !== null && ![...watch.tracked.values()].some(one => one.polling)) {
    watch.timer.cancel()
    watch.timer = null
  }
}

async function poll($: EngineInterface, watch: Watch, one: Tracked, now: number) {
  if (now - one.startedAt >= MAX_MS) {
    one.polling = false
    one.note = 'stopped after 2h'
    $.ui.toast(timedOutToast(one.id))
    return
  }
  let status: string | null = null
  try {
    const ran = await $.process.run(['xcrun', 'notarytool', 'info', one.id, ...(one.auth ?? []), '--output-format', 'json'], { timeoutMs: INFO_MS })
    status = ran.exitCode === 0 ? parseInfo(ran.stdout) : null
  } catch {
    status = null
  }
  // A failed or unreadable poll is transient: the next period asks again.
  if (status === null || !watch.tracked.has(one.id) || !one.polling) return
  one.status = status
  if (isFinal(status)) {
    one.polling = false
    one.auth = null
    $.ui.toast(finalToast(one.id, status))
  }
}

async function tick($: EngineInterface, watch: Watch) {
  if (watch.busy) return
  watch.busy = true
  try {
    const now = await $.clock.now()
    for (const one of [...watch.tracked.values()].filter(entry => entry.polling)) await poll($, watch, one, now)
  } finally {
    watch.busy = false
    stopTimerIfIdle(watch)
    showStatus($, watch)
  }
}

async function track($: EngineInterface, watch: Watch, id: string, file: string | null, status: string, auth: string[] | null) {
  const polling = auth !== null
  watch.tracked.set(id, { id, file, status, startedAt: await $.clock.now(), auth, polling, note: polling ? null : 'not polled' })
  if (!polling) $.ui.toast(unpolledToast(id))
  else watch.timer ??= $.clock.every(POLL_MS, () => void tick($, watch))
  showStatus($, watch)
}

function stopAll($: EngineInterface, watch: Watch): { submissions: number; scripts: number } {
  let submissions = 0
  for (const one of watch.tracked.values()) {
    if (!one.polling) continue
    one.polling = false
    one.auth = null
    one.note = 'stopped'
    submissions += 1
  }
  let scripts = 0
  for (const run of watch.scripts) {
    if (run.timer === null) continue
    run.timer.cancel()
    run.timer = null
    run.note = 'stopped'
    scripts += 1
  }
  stopTimerIfIdle(watch)
  showStatus($, watch)

  return { submissions, scripts }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function stoppedText(stopped: { submissions: number; scripts: number }): string {
  const parts = [
    stopped.submissions > 0 ? `polling ${plural(stopped.submissions, 'submission')}` : '',
    stopped.scripts > 0 ? `watching history for ${plural(stopped.scripts, 'script run')}` : '',
  ].filter(Boolean)

  return parts.length === 0 ? 'Nothing was being polled.' : `Stopped ${parts.join(' and ')}.`
}

// The keychain profile of a script run: the keychainProfile option, else read from the script's text.
async function profileOf($: EngineInterface, script: ScriptCall, configured: string): Promise<{ profile: string | null; from: ScriptRun['from'] }> {
  if (configured !== '') return { profile: configured, from: 'keychainProfile' }
  if (script.path === null) return { profile: null, from: null }
  try {
    const profile = scriptProfile(await $.fs.read(script.path), script.env)
    return { profile, from: profile === null ? null : 'script' }
  } catch {
    return { profile: null, from: null }
  }
}

// Asks `notarytool history` once and follows each submission created since the script started that is
// not followed yet: polled like a direct submit, or only toasted when history already shows it final.
async function scanHistory($: EngineInterface, watch: Watch, run: ScriptRun): Promise<boolean> {
  if (run.profile === null) return false
  let entries: ReturnType<typeof parseHistory> = null
  try {
    const ran = await $.process.run(['xcrun', 'notarytool', 'history', '--keychain-profile', run.profile, '--output-format', 'json'], { timeoutMs: INFO_MS })
    entries = ran.exitCode === 0 ? parseHistory(ran.stdout) : null
  } catch {
    entries = null
  }
  if (entries === null) return false
  for (const entry of newSubmissions(entries, run.startedAt)) {
    // Already followed (a direct submit in the same command, an earlier scan): never twice.
    if (watch.tracked.has(entry.id)) continue
    run.found += 1
    if (isFinal(entry.status)) {
      watch.tracked.set(entry.id, { id: entry.id, file: entry.name, status: entry.status, startedAt: await $.clock.now(), auth: null, polling: false, note: `from ${run.name}` })
      $.ui.toast(finalToast(entry.id, entry.status))
    } else await track($, watch, entry.id, entry.name, entry.status, ['--keychain-profile', run.profile])
  }

  return true
}

async function scriptTick($: EngineInterface, watch: Watch, run: ScriptRun) {
  if (run.busy || run.timer === null) return
  run.busy = true
  try {
    const ok = await scanHistory($, watch, run)
    const now = await $.clock.now()
    if (now - run.startedAt >= SCRIPT_MAX_MS) {
      run.timer?.cancel()
      run.timer = null
      run.note = 'watched history for 30 min'
    } else run.note = ok ? 'watching history' : 'watching history (last check failed)'
  } finally {
    run.busy = false
  }
}

// Runs after the script's Bash call has returned (never before its result).
async function followScript($: EngineInterface, watch: Watch, script: ScriptCall, startedAt: number, background: boolean, configured: string) {
  const run: ScriptRun = { name: script.name, startedAt, background, profile: null, from: null, found: 0, note: 'checking', timer: null, busy: false }
  watch.scripts.push(run)
  const { profile, from } = await profileOf($, script, configured)
  run.profile = profile
  run.from = from
  if (profile === null) {
    run.note = 'not checked: keychain profile unknown (set the keychainProfile option)'
    return
  }
  if (background) {
    run.note = 'watching history'
    run.timer = $.clock.every(POLL_MS, () => void scriptTick($, watch, run))
    return
  }
  run.note = (await scanHistory($, watch, run)) ? 'history checked' : 'history check failed'
}

function scriptLine(run: ScriptRun, now: number): string {
  const profile = run.profile === null ? null : `profile ${run.profile}${run.from === 'script' ? ' (read from the script)' : ''}`
  const found = run.profile === null ? null : plural(run.found, 'new submission')

  return ['script', run.name, run.background ? 'background' : null, age(now - run.startedAt), profile, found, run.note].filter(Boolean).join(' · ')
}

async function listing($: EngineInterface, watch: Watch): Promise<string> {
  if (watch.tracked.size === 0 && watch.scripts.length === 0) return 'No notarization submission tracked this session.'
  const now = await $.clock.now()
  const lines = [...watch.tracked.values()].map(one =>
    [one.id, one.file, one.status, age(now - one.startedAt), one.polling ? 'polling' : one.note].filter(Boolean).join(' · '),
  )

  return [...lines, ...watch.scripts.map(run => scriptLine(run, now))].join('\n')
}

const option = (value: unknown, fallback: string) => (typeof value === 'string' ? value.trim() : fallback)

export const register: Register = (on, options) => {
  const watch: Watch = { tracked: new Map(), timer: null, busy: false, scripts: [] }
  const scriptPattern = option(options?.scriptPattern, 'release')
  const keychainProfile = option(options?.keychainProfile, '')

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'notary-watch', description: 'List the notarization submissions followed this session (stop: stop polling)' })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // Synchronous checks first: any other call reaches next() with no await of this mod's.
    const script = e.agentId === undefined && e.tool === 'Bash' ? scriptCall(e.command, scriptPattern) : null
    const scriptStart = script === null ? 0 : await $.clock.now()
    const ran = await next(e)
    if (e.agentId !== undefined || e.tool !== 'Bash' || ran.deny !== undefined) return ran
    if (script !== null) {
      const output = ran.result as { backgroundTaskId?: unknown } | undefined
      const background = e.run_in_background === true || typeof output?.backgroundTaskId === 'string'
      // Deferred: the tool result is returned first, then history is asked.
      $.clock.after(0, () => void followScript($, watch, script, scriptStart, background, keychainProfile))
    }
    const submit = parseSubmit(e.command)
    if (submit === null) return ran
    const result = ran.result as { stdout?: unknown; stderr?: unknown } | undefined
    const text = [result?.stdout, result?.stderr].filter((part): part is string => typeof part === 'string').join('\n')
    const { id, status } = parseOutput(text)
    if (id === null) return ran
    // notarytool may end a waited-for Invalid submission with a failing exit: its final status still counts.
    if (submit.wait && isFinal(status)) {
      watch.tracked.set(id, { id, file: submit.file, status, startedAt: await $.clock.now(), auth: null, polling: false, note: 'waited' })
      $.ui.toast(finalToast(id, status))
      return ran
    }
    // A parsed status means the upload went through, even when the call failed (a --wait cut short by
    // --timeout or by the Bash tool); an id alone on a failed call may be a failed upload.
    if ((status === null && ran.isError === true) || watch.tracked.get(id)?.polling === true) return ran
    await track($, watch, id, submit.file, status ?? IN_PROGRESS, submit.canPoll ? submit.auth : null)

    return ran
  })

  on('command.run', { command: 'notary-watch' }, async ($, e) => {
    if (e.args.trim() === 'stop') {
      return { text: stoppedText(stopAll($, watch)) }
    }

    return { text: await listing($, watch) }
  })
}
