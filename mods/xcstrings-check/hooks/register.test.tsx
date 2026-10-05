import { expect, mock, test } from 'claude-code/testing'
import type { FsEntry, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PANE = {
  plugin: 'xcstrings-check',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'xcstrings-check',
  props: { title: 'String Catalogs', isFocused: false, bodyColumns: 100, placement: 'dock' } as never,
} as const

const unit = (state: string) => ({ stringUnit: { state, value: 'x' } })
const catalog = (strings: Record<string, unknown>) => JSON.stringify({ sourceLanguage: 'en', strings, version: '1.0' })

const COMPLETE = catalog({ Done: { localizations: { fr: unit('translated') } } })
const PENDING = catalog({
  Done: { localizations: { fr: unit('translated') } },
  Hello: { localizations: { fr: unit('needs_review') } },
  Bye: {},
  Gone: { extractionState: 'stale', localizations: { fr: unit('translated') } },
})

// /dev/app (a git project) holds App/Localizable.xcstrings and Sources/*.swift; /dev/tool has no catalog.
function world(on: On, texts: Record<string, string>) {
  const disk = { ...texts }
  const reads: string[] = []
  const lists: string[] = []
  const statuses: (string | undefined)[] = []
  const entry = (name: string): FsEntry => ({ name, kind: name.includes('.') && name !== '.git' ? 'file' : 'dir', size: 1, mtimeMs: 0, isLink: false })
  const tree: Record<string, string[]> = {
    '/dev': ['app', 'tool'],
    '/dev/app': ['.git', 'App', 'Sources', 'node_modules'],
    '/dev/app/App': ['Localizable.xcstrings', 'Info.plist'],
    '/dev/app/Sources': ['Main.swift'],
    '/dev/app/node_modules': ['Junk.xcstrings'],
    '/dev/tool': ['.git', 'main.swift'],
  }
  const clock = mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.cwd', () => ({ value: '/dev/app' }))
  on('fs.list', (_$, e) => {
    lists.push(e.path ?? '')
    return { value: (tree[e.path ?? ''] ?? []).map(entry) }
  })
  on('fs.read', (_$, e) => {
    reads.push(e.path)
    const text = disk[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text as never }
  })
  on('tool.call', () => ({ result: 'ok' as never }))
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))

  return { disk, reads, lists, statuses, clock }
}

const CAT = '/dev/app/App/Localizable.xcstrings'
const edit = ($: Engine, path: string, extra: Record<string, unknown> = {}) =>
  $.tool.call({ tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b', ...extra } as never)
const command = async ($: Engine, args = '') => ((await $.command.run({ command: 'xcstrings', args } as never)) as { text: string }).text

test('editing a catalog checks it after a 2 s pause and shows what is pending', async ($, on) => {
  const { reads, statuses, clock } = world(on, { [CAT]: PENDING })
  await edit($, CAT)
  await clock.advance(1999)
  expect(reads).toEqual([])
  await clock.advance(1)
  expect(reads).toEqual([CAT])
  expect(statuses.at(-1)).toBe('🌐 fr: 1 missing · 1 review · 1 stale')
})

test('editing Swift beside catalogs re-checks the project catalogs, never those in node_modules', async ($, on) => {
  const { reads, statuses, clock } = world(on, { [CAT]: COMPLETE })
  await edit($, '/dev/app/Sources/Main.swift')
  await edit($, '/dev/app/Sources/Main.swift')
  await clock.advance(2000)
  expect(reads).toEqual([CAT])
  expect(statuses.at(-1)).toBeUndefined()
})

test('the status line clears once the catalog is complete', async ($, on) => {
  const { disk, statuses, clock } = world(on, { [CAT]: PENDING })
  await edit($, CAT)
  await clock.advance(2000)
  disk[CAT] = COMPLETE
  await edit($, CAT)
  await clock.advance(2000)
  expect(statuses).toEqual(['🌐 fr: 1 missing · 1 review · 1 stale', undefined])
})

test('Swift edits in a project without catalogs, by subagents, or of other files read nothing', async ($, on) => {
  const { reads, statuses, clock } = world(on, { [CAT]: PENDING })
  await edit($, '/dev/tool/main.swift')
  await edit($, '/dev/app/Sources/Main.swift', { agentId: 'sub-1' })
  await edit($, '/dev/app/README.md')
  await clock.advance(5000)
  expect(reads).toEqual([])
  expect(statuses).toEqual([])
})

test('a malformed catalog is reported unreadable', async ($, on) => {
  const { statuses, clock } = world(on, { [CAT]: '{"sourceLanguage":"en","strings":{' })
  await edit($, CAT)
  await clock.advance(2000)
  expect(statuses.at(-1)).toBe('🌐 1 unreadable')
  expect(await command($, 'check')).toBe('1 catalog: 🌐 1 unreadable')
})

test('expected languages from userConfig count as missing', { options: { languages: 'de, fr' } }, async ($, on) => {
  const { statuses, clock } = world(on, { [CAT]: COMPLETE })
  await edit($, CAT)
  await clock.advance(2000)
  expect(statuses.at(-1)).toBe('🌐 de: 1 missing')
})

test('/xcstrings check finds the session project catalogs now', async ($, on) => {
  const { reads } = world(on, { [CAT]: PENDING })
  expect(await command($)).toBe('No String Catalog checked yet (/xcstrings check).')
  expect(await command($, 'check')).toBe('1 catalog: 🌐 fr: 1 missing · 1 review · 1 stale')
  expect(reads).toEqual([CAT])
})

test('off stops checking and clears the status line; on brings it back', async ($, on) => {
  const { reads, statuses, clock } = world(on, { [CAT]: PENDING })
  expect(await command($, 'off')).toBe('xcstrings-check is off.')
  await edit($, CAT)
  await clock.advance(2000)
  expect(reads).toEqual([])
  expect(statuses).toEqual([undefined])
  expect(await command($, 'on')).toBe('xcstrings-check is on.')
  await edit($, CAT)
  await clock.advance(2000)
  expect(statuses.at(-1)).toBe('🌐 fr: 1 missing · 1 review · 1 stale')
})

test('the pane lists each catalog, language and keys', async ($, on) => {
  const { clock } = world(on, { [CAT]: PENDING })
  await edit($, CAT)
  await clock.advance(2000)
  await command($)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'App/Localizable.xcstrings — 4 keys, source en' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '  fr: 1 missing · 1 review' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '    missing (1): "Bye"' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '    needs review (1): "Hello"' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '  stale (1): "Gone"' })).toBeDefined()
  await ui.unmount()
})
