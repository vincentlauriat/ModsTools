import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SnapshotMeta } from '../types'
import {
  MAX_FILE_BYTES,
  addSkipped,
  displayPath,
  done,
  evictions,
  fileRows,
  formatBytes,
  isLossy,
  listText,
  parseArgs,
  plan,
  plural,
  preview,
  resolvePath,
  rowLabel,
  stackOf,
  utf8Bytes,
} from './snapshots'
import type { Plan } from './snapshots'

const PANE = 'edit-undo'
const TITLE = 'Edit undo'
const RM_MS = 10_000
const QUEUE_MS = 2_000

const index = atom({ plugin: 'edit-undo', key: 'index' } as const, [])
const skipped = atom({ plugin: 'edit-undo', key: 'skipped' } as const, [])
const confirm = atom({ plugin: 'edit-undo', key: 'confirm' } as const, null)
const forceable = atom({ plugin: 'edit-undo', key: 'forceable' } as const, null)
const armed = atom({ plugin: 'edit-undo', key: 'armed' } as const, null)
const notice = atom({ plugin: 'edit-undo', key: 'notice' } as const, null)
const before = { plugin: 'edit-undo', key: 'before' } as const

type Captured = { kind: 'missing' } | { kind: 'text'; text: string } | { kind: 'skip'; reason: string }

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))

  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// The file as it stands: absent, its text, or a reason it is not snapshotted.
async function capture($: EngineInterface, path: string): Promise<Captured> {
  const stat = await $.fs.stat(path).catch(() => null)
  if (stat === null) return (await $.fs.exists(path).catch(() => true)) ? { kind: 'skip', reason: 'could not be read' } : { kind: 'missing' }
  if (stat.kind !== 'file') return { kind: 'skip', reason: 'not a regular file' }
  if (stat.size > MAX_FILE_BYTES) return { kind: 'skip', reason: `over 1 MB (${formatBytes(stat.size)}), not snapshotted` }
  const text = await $.fs.read(path).catch(() => null)
  if (typeof text !== 'string') return { kind: 'skip', reason: 'could not be read' }
  if (isLossy(text)) return { kind: 'skip', reason: 'not UTF-8 text, not snapshotted' }

  return { kind: 'text', text }
}

// The hash of the file now, null when absent, undefined when it cannot be read.
async function currentHash($: EngineInterface, path: string): Promise<string | null | undefined> {
  if (!(await $.fs.exists(path).catch(() => true))) return null
  const text = await $.fs.read(path).catch(() => null)

  return typeof text === 'string' ? sha256(text) : undefined
}

async function skip($: EngineInterface, path: string, reason: string) {
  const time = await $.clock.now()
  await update($, skipped, list => addSkipped(list, { path, reason, time }))
}

// Runs once the tool's result went back: records the content the tool left and pushes the snapshot.
async function record($: EngineInterface, path: string, tool: string, pre: { kind: 'missing' } | { kind: 'text'; text: string }) {
  const after = await currentHash($, path)
  if (after === undefined) return
  const time = await $.clock.now()
  const id = `${time.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const meta: SnapshotMeta = {
    id,
    path,
    time,
    tool,
    existed: pre.kind === 'text',
    bytes: pre.kind === 'text' ? utf8Bytes(pre.text) : 0,
    afterHash: after,
  }
  try {
    await $.state.set({ ...before, id }, pre.kind === 'text' ? pre.text : '')
  } catch {
    await skip($, path, 'too large to keep in session state, not snapshotted')
    return
  }
  let dropped: string[] = []
  await update($, index, list => {
    const next = [...list, meta]
    dropped = evictions(next)
    return next.filter(one => !dropped.includes(one.id))
  })
  for (const gone of dropped) await $.state.set({ ...before, id: gone }, '').catch(() => undefined)
}

// Each record waits for the previous one, and a new tool call waits for both: the hash read after a call is that call's.
let queue: Promise<void> = Promise.resolve()
let busy = 0

async function snapshotAround<T extends { deny?: unknown; isError?: boolean }>($: EngineInterface, tool: string, given: string, agentId: string | undefined, run: () => Promise<T>): Promise<T> {
  if (agentId !== undefined || given === '') return run()
  if (busy > 0) await Promise.race([queue, $.clock.sleep(QUEUE_MS).catch(() => undefined)])
  const path = resolvePath(given, await $.session.cwd())
  const pre = await capture($, path)
  const ran = await run()
  if (ran.deny !== undefined || ran.isError === true) return ran
  if (pre.kind === 'skip') {
    $.clock.after(0, () => void skip($, path, pre.reason).catch(() => undefined))
    return ran
  }
  busy += 1
  const previous = queue
  queue = new Promise<void>(resolve => {
    $.clock.after(0, () => {
      void previous
        .then(() => record($, path, tool, pre))
        .catch(() => undefined)
        .finally(() => {
          busy -= 1
          resolve()
        })
    })
  })

  return ran
}

async function planFor($: EngineInterface, path: string, force: boolean): Promise<{ p: Plan; left: number }> {
  const stack = stackOf(await read($, index), path)
  const hash = await currentHash($, path)
  if (hash === undefined) return { p: { refuse: 'the file cannot be read now', isForceable: false }, left: 0 }

  return { p: plan(stack[stack.length - 1], hash, force), left: Math.max(0, stack.length - 1) }
}

// Restores (or deletes) the file from its latest snapshot, then pops it. Only ever called from a command or a button.
// `expected` is the snapshot the preview described: a newer edit since then is not undone on that confirm.
async function undo($: EngineInterface, path: string, force: boolean, expected: string): Promise<{ text: string; isDone: boolean; isStale?: boolean }> {
  const cwd = await $.session.cwd()
  const { p } = await planFor($, path, force)
  if ('refuse' in p) return { text: done(p, path, cwd), isDone: false }
  if (p.snapshot.id !== expected) return { text: `Not undone: ${displayPath(path, cwd)} was edited again since the preview.`, isDone: false, isStale: true }
  try {
    if (p.action === 'restore') {
      const { value } = await $.state.get({ ...before, id: p.snapshot.id })
      if (typeof value !== 'string') return { text: `Cannot undo ${displayPath(path, cwd)}: the snapshot is gone.`, isDone: false }
      await $.fs.write(path, value)
    } else {
      const stat = await $.fs.stat(path)
      if (stat.kind !== 'file') return { text: `Cannot undo ${displayPath(path, cwd)}: not a regular file.`, isDone: false }
      await $.process.run(['rm', '--', path], { timeoutMs: RM_MS })
      if (await $.fs.exists(path).catch(() => true)) return { text: `Cannot undo ${displayPath(path, cwd)}: the file could not be deleted.`, isDone: false }
    }
  } catch {
    return { text: `Cannot undo ${displayPath(path, cwd)}: the file could not be written.`, isDone: false }
  }
  await update($, index, list => list.filter(one => one.id !== p.snapshot.id))
  await $.state.set({ ...before, id: p.snapshot.id }, '').catch(() => undefined)
  const text = done(p, path, cwd)
  $.ui.toast(text)

  return { text, isDone: true }
}

async function resetConfirm($: EngineInterface, message: string | null) {
  await update($, confirm, () => null)
  await update($, forceable, () => null)
  await update($, notice, () => message)
}

// Two-step: the first press shows what will happen and arms the button, the second does it.
async function press($: EngineInterface, path: string, force: boolean) {
  const key = `${force ? 'force' : 'undo'}:${path}`
  const pending = await read($, confirm)
  let lead = ''
  if (pending !== null && pending.key === key) {
    const out = await undo($, path, force, pending.snapshot)
    if (out.isStale !== true) {
      await resetConfirm($, out.text)
      return
    }
    lead = `${out.text} `
  }
  const cwd = await $.session.cwd()
  const { p, left } = await planFor($, path, force)
  const text = lead + preview(p, path, cwd, await $.clock.now(), left)
  if ('refuse' in p) {
    await update($, confirm, () => null)
    await update($, forceable, () => (p.isForceable ? path : null))
  } else {
    await update($, confirm, () => ({ key, snapshot: p.snapshot.id }))
    if (!force) await update($, forceable, () => null)
  }
  await update($, notice, () => ('refuse' in p && p.isForceable ? `${text} "Force undo" restores it anyway.` : text))
}

async function fileCommand($: EngineInterface, given: string, isConfirm: boolean, force: boolean): Promise<string> {
  const cwd = await $.session.cwd()
  const path = resolvePath(given, cwd)
  const key = `${force ? 'force' : 'undo'}:${path}`
  let lead = ''
  if (isConfirm) {
    const pending = await read($, armed)
    if (pending === null || pending.key !== key) {
      return `Run /undo ${given}${force ? ' force' : ''} first to see what it will do, then add "confirm".`
    }
    await update($, armed, () => null)
    const out = await undo($, path, force, pending.snapshot)
    if (out.isStale !== true) return out.text
    lead = `${out.text} `
  }
  const { p, left } = await planFor($, path, force)
  const text = lead + preview(p, path, cwd, await $.clock.now(), left)
  if ('refuse' in p) {
    await update($, armed, () => null)
    return p.isForceable ? `${text} Run /undo ${given} force to restore it anyway.` : text
  }
  await update($, armed, () => ({ key, snapshot: p.snapshot.id }))

  return `${text} Run /undo ${given}${force ? ' force' : ''} confirm to do it.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'undo',
      description: 'Undo Claude’s file edits of this session: /undo (pane) | /undo <path> [force] [confirm] | /undo list | /undo clear',
      argumentHint: '[<path> [force] [confirm] | list | clear | close]',
    })

    return next(e)
  })

  on('tool.call', { tool: 'Edit' }, ($, e, next) => snapshotAround($, 'Edit', e.file_path, e.agentId, () => next(e)))
  on('tool.call', { tool: 'Write' }, ($, e, next) => snapshotAround($, 'Write', e.file_path, e.agentId, () => next(e)))
  on('tool.call', { tool: 'NotebookEdit' }, ($, e, next) => snapshotAround($, 'NotebookEdit', e.notebook_path, e.agentId, () => next(e)))

  on('command.run', { command: 'undo' }, async ($, e) => {
    const args = parseArgs(e.args)
    const cwd = await $.session.cwd()
    if (args.kind === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Undo pane closed.' }
    }
    if (args.kind === 'list') return { text: listText(await read($, index), await read($, skipped), cwd, await $.clock.now()) }
    if (args.kind === 'clear') {
      const list = await read($, index)
      await update($, index, () => [])
      await update($, skipped, () => [])
      await update($, armed, () => null)
      await resetConfirm($, null)
      for (const one of list) await $.state.set({ ...before, id: one.id }, '').catch(() => undefined)
      return { text: `Cleared ${plural(list.length, 'snapshot')}.` }
    }
    if (args.kind === 'file') return { text: await fileCommand($, args.path, args.confirm, args.force) }
    await resetConfirm($, null)
    await $.ui.open({ id: PANE, title: TITLE })
    const count = fileRows(await read($, index)).length

    return { text: `Undo pane opened (${plural(count, 'file')}).` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const rows = fileRows(await read($, index))
    const skips = await read($, skipped)
    const pending = await read($, confirm)
    const canForce = await read($, forceable)
    const message = await read($, notice)
    const cwd = await $.session.cwd()
    const now = await $.clock.now()

    return (
      <Box flexDirection="column">
        <Text bold>{rows.length === 0 ? 'No edits to undo yet.' : plural(rows.length, 'file')}</Text>
        {message !== null && <Text>{message}</Text>}
        {rows.map(row => (
          <Box flexDirection="column">
            <Text>{rowLabel(row, cwd, now)}</Text>
            <Button key={`undo:${row.path}`} label={pending?.key === `undo:${row.path}` ? 'Confirm undo?' : 'Undo'} onPress={() => press($, row.path, false)} />
            {canForce === row.path && (
              <Button key={`force:${row.path}`} label={pending?.key === `force:${row.path}` ? 'Confirm force undo?' : 'Force undo'} onPress={() => press($, row.path, true)} />
            )}
          </Box>
        ))}
        {skips.map(one => (
          <Text dimColor>{`${displayPath(one.path, cwd)}: ${one.reason}`}</Text>
        ))}
      </Box>
    )
  })
}
