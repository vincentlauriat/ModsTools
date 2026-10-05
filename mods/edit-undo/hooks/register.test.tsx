import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

const CWD = '/dev/app'
const PANE = {
  plugin: 'edit-undo',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'edit-undo',
  props: { title: 'Edit undo', isFocused: false, bodyColumns: 80, placement: 'dock' } as never,
} as const

const ran = (exitCode = 0): ProcessRunResult => ({ exitCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

// A fake file system and fake Edit/Write tools over it.
function world(on: On, files: Record<string, string> = {}) {
  const fs = new Map(Object.entries(files))
  const sizes = new Map<string, number>()
  const toasts: string[] = []
  const removed: string[] = []
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.cwd', () => ({ value: CWD }))
  on('fs.exists', (_$, e) => ({ value: fs.has(e.path) }))
  on('fs.stat', (_$, e) => {
    const text = fs.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: { kind: 'file', size: sizes.get(e.path) ?? text.length, mtimeMs: 0, isLink: false } as never }
  })
  on('fs.read', (_$, e) => {
    const text = fs.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.write', (_$, e) => {
    fs.set(e.path, e.text)
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    if (e.argv[0] === 'rm') {
      const path = e.argv[e.argv.length - 1]!
      removed.push(path)
      fs.delete(path)
      return { value: ran() }
    }
    throw new Error(`unexpected ${e.argv.join(' ')}`)
  })
  on('tool.call', (_$, e) => {
    const input = e as unknown as { tool: string; file_path?: string; notebook_path?: string; content?: string; old_string?: string; new_string?: string; fail?: boolean }
    const path = input.file_path ?? input.notebook_path!
    if (input.fail === true) return { result: 'failed' as never, isError: true }
    if (input.tool === 'Write') fs.set(path, input.content!)
    else fs.set(path, fs.get(path)!.replace(input.old_string!, input.new_string!))
    return { result: 'ok' as never }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  return { fs, sizes, toasts, removed, clock }
}

async function edit($: Engine, clock: MockClock, path: string, from: string, to: string) {
  await $.tool.call({ tool: 'Edit', file_path: path, old_string: from, new_string: to } as never)
  await clock.advance(1000)
}

async function write($: Engine, clock: MockClock, path: string, content: string) {
  await $.tool.call({ tool: 'Write', file_path: path, content } as never)
  await clock.advance(1000)
}

const undo = async ($: Engine, args: string) => ((await $.command.run({ command: 'undo', args } as never)) as { text: string }).text

test('an edit is snapshotted and /undo <path> restores it in two steps', async ($, on) => {
  const { fs, toasts, clock } = world(on, { '/dev/app/a.ts': 'one' })
  await edit($, clock, '/dev/app/a.ts', 'one', 'two')
  expect(fs.get('/dev/app/a.ts')).toBe('two')

  expect(await undo($, 'a.ts')).toBe('Undo will restore a.ts to its content before Edit 1s ago (0 snapshots left after). Run /undo a.ts confirm to do it.')
  expect(fs.get('/dev/app/a.ts')).toBe('two')
  expect(await undo($, 'a.ts confirm')).toBe('Undo: restored a.ts (before Edit)')
  expect(fs.get('/dev/app/a.ts')).toBe('one')
  expect(toasts).toEqual(['Undo: restored a.ts (before Edit)'])
  expect(await undo($, 'a.ts')).toBe('Cannot undo a.ts: no snapshot to undo.')
})

test('confirm without a preview of the same path does nothing', async ($, on) => {
  const { fs, clock } = world(on, { '/dev/app/a.ts': 'one', '/dev/app/b.ts': 'bee' })
  await edit($, clock, '/dev/app/a.ts', 'one', 'two')
  await edit($, clock, '/dev/app/b.ts', 'bee', 'BEE')

  expect(await undo($, 'a.ts confirm')).toBe('Run /undo a.ts first to see what it will do, then add "confirm".')
  await undo($, 'b.ts')
  expect(await undo($, '/dev/app/a.ts confirm')).toContain('first to see')
  expect(fs.get('/dev/app/a.ts')).toBe('two')
  expect(fs.get('/dev/app/b.ts')).toBe('BEE')
})

test('successive undos walk back through the snapshots', async ($, on) => {
  const { fs, clock } = world(on, { '/dev/app/a.ts': 'v1' })
  await edit($, clock, '/dev/app/a.ts', 'v1', 'v2')
  await edit($, clock, '/dev/app/a.ts', 'v2', 'v3')

  await undo($, 'a.ts')
  await undo($, 'a.ts confirm')
  expect(fs.get('/dev/app/a.ts')).toBe('v2')
  await undo($, 'a.ts')
  expect(await undo($, 'a.ts confirm')).toBe('Undo: restored a.ts (before Edit)')
  expect(fs.get('/dev/app/a.ts')).toBe('v1')
})

test('a file changed since Claude’s edit is not restored unless forced', async ($, on) => {
  const { fs, clock } = world(on, { '/dev/app/a.ts': 'one' })
  await edit($, clock, '/dev/app/a.ts', 'one', 'two')
  fs.set('/dev/app/a.ts', 'two, then edited by hand')

  expect(await undo($, 'a.ts')).toBe('Cannot undo a.ts: the file has changed since Claude last edited it. Run /undo a.ts force to restore it anyway.')
  expect(await undo($, 'a.ts confirm')).toContain('first to see')
  expect(fs.get('/dev/app/a.ts')).toBe('two, then edited by hand')

  expect(await undo($, 'a.ts force')).toContain('Run /undo a.ts force confirm to do it.')
  expect(await undo($, 'a.ts force confirm')).toBe('Undo: restored a.ts (before Edit)')
  expect(fs.get('/dev/app/a.ts')).toBe('one')
})

test('a file Claude created is deleted on undo, but only while it is as Claude wrote it', async ($, on) => {
  const { fs, removed, clock } = world(on)
  await write($, clock, '/dev/app/new.ts', 'fresh')
  fs.set('/dev/app/new.ts', 'fresh + mine')

  expect(await undo($, 'new.ts force')).toBe('Cannot undo new.ts: the file did not exist before and has changed since Claude wrote it: it is not deleted.')
  expect(await undo($, 'new.ts force confirm')).toContain('first to see')
  expect(removed).toEqual([])

  fs.set('/dev/app/new.ts', 'fresh')
  expect(await undo($, 'new.ts')).toBe('Undo will delete new.ts: it did not exist before Write 1s ago. Run /undo new.ts confirm to do it.')
  expect(fs.has('/dev/app/new.ts')).toBe(true)
  expect(await undo($, 'new.ts confirm')).toBe('Undo: deleted new.ts')
  expect(removed).toEqual(['/dev/app/new.ts'])
  expect(fs.has('/dev/app/new.ts')).toBe(false)
})

test('failed or denied tool calls and subagent edits keep no snapshot', async ($, on) => {
  const { clock } = world(on, { '/dev/app/a.ts': 'one' })
  await $.tool.call({ tool: 'Edit', file_path: '/dev/app/a.ts', old_string: 'one', new_string: 'two', fail: true } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/dev/app/a.ts', old_string: 'one', new_string: 'two', agentId: 'sub-1' } as never)
  await clock.advance(1000)

  expect(await undo($, 'list')).toBe('No snapshots in this session.')
})

test('files over 1 MB are skipped and /undo list says so', async ($, on) => {
  const { sizes, clock } = world(on, { '/dev/app/big.json': '{}', '/dev/app/a.ts': 'one' })
  sizes.set('/dev/app/big.json', 2 * 1024 * 1024)
  await write($, clock, '/dev/app/big.json', '{"a":1}')
  await edit($, clock, '/dev/app/a.ts', 'one', 'two')

  expect(await undo($, 'list')).toBe(
    ['1 file, 1 snapshot, 3 B:', '  a.ts · 1 snapshot · last Edit 1s ago', 'Not snapshotted:', '  big.json: over 1 MB (2.0 MB), not snapshotted'].join('\n'),
  )
})

test('no more than 20 snapshots are kept per file', async ($, on) => {
  const { fs, clock } = world(on, { '/dev/app/a.ts': 'v0' })
  for (let i = 0; i < 22; i++) await edit($, clock, '/dev/app/a.ts', `v${i}`, `v${i + 1}`)

  expect(await undo($, 'list')).toContain('a.ts · 20 snapshots')
  for (let i = 0; i < 20; i++) {
    await undo($, 'a.ts')
    await undo($, 'a.ts confirm')
  }
  expect(fs.get('/dev/app/a.ts')).toBe('v2')
})

test('/undo clear drops every snapshot', async ($, on) => {
  const { clock } = world(on, { '/dev/app/a.ts': 'one' })
  await edit($, clock, '/dev/app/a.ts', 'one', 'two')

  expect(await undo($, 'clear')).toBe('Cleared 1 snapshot.')
  expect(await undo($, 'list')).toBe('No snapshots in this session.')
})

test('the pane lists files; Undo asks first, then restores and toasts', async ($, on) => {
  const { fs, toasts, clock } = world(on, { '/dev/app/a.ts': 'one', '/dev/app/b.ts': 'bee' })
  await edit($, clock, '/dev/app/a.ts', 'one', 'two')
  await edit($, clock, '/dev/app/a.ts', 'two', 'three')
  await edit($, clock, '/dev/app/b.ts', 'bee', 'BEE')
  expect(await undo($, '')).toBe('Undo pane opened (2 files).')

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'b.ts · 1 snapshot · last Edit 1s ago' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'a.ts · 2 snapshots · last Edit 2s ago' })).toBeDefined()

  await ui.press({ key: 'undo:/dev/app/a.ts' })
  expect(fs.get('/dev/app/a.ts')).toBe('three')
  expect(await ui.find({ type: 'Button', key: 'undo:/dev/app/a.ts', text: 'Confirm undo?' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Undo will restore a.ts/ })).toBeDefined()

  await ui.press({ key: 'undo:/dev/app/a.ts' })
  expect(fs.get('/dev/app/a.ts')).toBe('two')
  expect(toasts).toEqual(['Undo: restored a.ts (before Edit)'])
  expect(await ui.find({ type: 'Text', text: /^a.ts · 1 snapshot/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'undo:/dev/app/a.ts', text: 'Undo' })).toBeDefined()
  await ui.unmount()
})

test('pane: arming another row disarms the first; a changed file offers Force undo', async ($, on) => {
  const { fs, clock } = world(on, { '/dev/app/a.ts': 'one', '/dev/app/b.ts': 'bee' })
  await edit($, clock, '/dev/app/a.ts', 'one', 'two')
  await edit($, clock, '/dev/app/b.ts', 'bee', 'BEE')
  await undo($, '')

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'undo:/dev/app/a.ts' })
  await ui.press({ key: 'undo:/dev/app/b.ts' })
  expect(await ui.find({ type: 'Button', key: 'undo:/dev/app/a.ts', text: 'Undo' })).toBeDefined()
  await ui.press({ key: 'undo:/dev/app/a.ts' })
  expect(fs.get('/dev/app/a.ts')).toBe('two')

  fs.set('/dev/app/a.ts', 'hand edit')
  await ui.press({ key: 'undo:/dev/app/a.ts' })
  await ui.press({ key: 'undo:/dev/app/a.ts' })
  expect(fs.get('/dev/app/a.ts')).toBe('hand edit')
  expect(await ui.find({ type: 'Text', text: /changed since Claude last edited it\. "Force undo"/ })).toBeDefined()

  await ui.press({ key: 'force:/dev/app/a.ts' })
  expect(fs.get('/dev/app/a.ts')).toBe('hand edit')
  expect(await ui.find({ type: 'Button', key: 'force:/dev/app/a.ts', text: 'Confirm force undo?' })).toBeDefined()
  await ui.press({ key: 'force:/dev/app/a.ts' })
  expect(fs.get('/dev/app/a.ts')).toBe('one')
  await ui.unmount()
})

test('nothing is undone without a command or a press', async ($, on) => {
  const { fs, clock, toasts } = world(on, { '/dev/app/a.ts': 'one' })
  await edit($, clock, '/dev/app/a.ts', 'one', 'two')
  await clock.advance(60_000)

  expect(fs.get('/dev/app/a.ts')).toBe('two')
  expect(toasts).toEqual([])
})

test('the snapshot is recorded after the tool result went back, and the next edit waits for it', async ($, on) => {
  const { fs, clock } = world(on, { '/dev/app/a.ts': 'one' })
  await $.tool.call({ tool: 'Edit', file_path: '/dev/app/a.ts', old_string: 'one', new_string: 'two' } as never)
  expect(await undo($, 'list')).toBe('No snapshots in this session.')

  const second = $.tool.call({ tool: 'Edit', file_path: '/dev/app/a.ts', old_string: 'two', new_string: 'three' } as never)
  await clock.settle()
  await second
  await clock.advance(1000)
  expect(fs.get('/dev/app/a.ts')).toBe('three')
  expect(await undo($, 'list')).toContain('a.ts · 2 snapshots')

  await undo($, 'a.ts')
  expect(await undo($, 'a.ts confirm')).toBe('Undo: restored a.ts (before Edit)')
  expect(fs.get('/dev/app/a.ts')).toBe('two')
  await undo($, 'a.ts')
  await undo($, 'a.ts confirm')
  expect(fs.get('/dev/app/a.ts')).toBe('one')
})

test('a confirm after Claude edited the file again does not undo the newer edit, and previews afresh', async ($, on) => {
  const { fs, clock } = world(on, { '/dev/app/a.ts': 'v1' })
  await edit($, clock, '/dev/app/a.ts', 'v1', 'v2')
  await undo($, 'a.ts')
  await edit($, clock, '/dev/app/a.ts', 'v2', 'v3')

  expect(await undo($, 'a.ts confirm')).toBe(
    'Not undone: a.ts was edited again since the preview. Undo will restore a.ts to its content before Edit 1s ago (1 snapshot left after). Run /undo a.ts confirm to do it.',
  )
  expect(fs.get('/dev/app/a.ts')).toBe('v3')
  expect(await undo($, 'a.ts confirm')).toBe('Undo: restored a.ts (before Edit)')
  expect(fs.get('/dev/app/a.ts')).toBe('v2')
})

test('pane: a press after Claude edited the row again re-arms instead of undoing', async ($, on) => {
  const { fs, clock } = world(on, { '/dev/app/a.ts': 'v1' })
  await edit($, clock, '/dev/app/a.ts', 'v1', 'v2')
  await undo($, '')

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'undo:/dev/app/a.ts' })
  await edit($, clock, '/dev/app/a.ts', 'v2', 'v3')
  await ui.press({ key: 'undo:/dev/app/a.ts' })
  expect(fs.get('/dev/app/a.ts')).toBe('v3')
  expect(await ui.find({ type: 'Text', text: /^Not undone: a.ts was edited again since the preview/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'undo:/dev/app/a.ts', text: 'Confirm undo?' })).toBeDefined()
  await ui.press({ key: 'undo:/dev/app/a.ts' })
  expect(fs.get('/dev/app/a.ts')).toBe('v2')
  await ui.unmount()
})
