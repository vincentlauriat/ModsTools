import type { EngineInterface, Register } from 'claude-code'

import { IN_PROGRESS, age, finalToast, isFinal, parseInfo, parseOutput, parseSubmit, statusLine, timedOutToast, unpolledToast } from './notary'

const POLL_MS = 60_000
const INFO_MS = 30_000
const MAX_MS = 2 * 60 * 60_000

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

type Watch = {
  tracked: Map<string, Tracked>
  timer: { cancel: () => void } | null
  busy: boolean
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

function stopAll($: EngineInterface, watch: Watch): number {
  let stopped = 0
  for (const one of watch.tracked.values()) {
    if (!one.polling) continue
    one.polling = false
    one.auth = null
    one.note = 'stopped'
    stopped += 1
  }
  stopTimerIfIdle(watch)
  showStatus($, watch)

  return stopped
}

async function listing($: EngineInterface, watch: Watch): Promise<string> {
  if (watch.tracked.size === 0) return 'No notarization submission tracked this session.'
  const now = await $.clock.now()
  const lines = [...watch.tracked.values()].map(one =>
    [one.id, one.file, one.status, age(now - one.startedAt), one.polling ? 'polling' : one.note].filter(Boolean).join(' · '),
  )

  return lines.join('\n')
}

export const register: Register = on => {
  const watch: Watch = { tracked: new Map(), timer: null, busy: false }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'notary-watch', description: 'List the notarization submissions followed this session (stop: stop polling)' })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || e.tool !== 'Bash' || ran.deny !== undefined) return ran
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
      const stopped = stopAll($, watch)
      return { text: stopped === 0 ? 'Nothing was being polled.' : `Stopped polling ${stopped} submission${stopped === 1 ? '' : 's'}.` }
    }

    return { text: await listing($, watch) }
  })
}
