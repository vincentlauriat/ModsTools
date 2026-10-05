import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PLIST = '/dev/app/Info.plist'
const YML = '/dev/app/project.yml'
const INFO = '<dict>\n\t<key>SUFeedURL</key>\n\t<string>https://example.test/appcast.xml</string>\n\t<key>SUPublicEDKey</key>\n\t<string>OLDKEY=</string>\n</dict>'

let engine: 'allow' | 'ask' | 'deny' = 'allow'

function world(on: On) {
  const files = new Map([
    [PLIST, INFO],
    [YML, 'name: App\ntargets:\n  App:\n    info:\n      properties:\n        SUFeedURL: https://example.test/appcast.xml\n'],
  ])
  on('tool.check', () => ({ decision: engine, reason: 'engine' }))
  on('session.cwd', () => ({ value: '/dev/app' }))
  on('fs.read', (_$, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text as never }
  })
}

const check = ($: Engine, tool: string, input: Record<string, unknown>) => $.tool.check({ tool, input } as never)

test('an Edit whose old_string is only the plist value still asks when the key changes', async ($, on) => {
  engine = 'allow'
  world(on)
  const asked = await check($, 'Edit', { file_path: PLIST, old_string: '<string>OLDKEY=</string>', new_string: '<string>NEWKEY=</string>' })
  expect(asked.decision).toBe('ask')
  expect(asked.reason).toContain('changes SUPublicEDKey from OLDKEY= to NEWKEY= in Info.plist')
})

test('an Edit elsewhere in the same file, or with a relative path to another file, passes', async ($, on) => {
  engine = 'allow'
  world(on)
  expect((await check($, 'Edit', { file_path: PLIST, old_string: 'appcast.xml', new_string: 'feed.xml' })).decision).toBe('allow')
  expect((await check($, 'Edit', { file_path: 'project.yml', old_string: 'name: App', new_string: 'name: Bpp' })).decision).toBe('allow')
})

test('adding SUPublicEDKey where there was none passes; a Write replacing it asks', async ($, on) => {
  engine = 'allow'
  world(on)
  const added = await check($, 'Edit', {
    file_path: YML,
    old_string: 'SUFeedURL: https://example.test/appcast.xml',
    new_string: 'SUFeedURL: https://example.test/appcast.xml\n        SUPublicEDKey: "NEW="',
  })
  expect(added.decision).toBe('allow')
  expect((await check($, 'Write', { file_path: '/dev/app/New.plist', content: INFO })).decision).toBe('allow')
  expect((await check($, 'Write', { file_path: PLIST, content: INFO.replace('OLDKEY=', 'OTHER=') })).decision).toBe('ask')
  expect((await check($, 'Write', { file_path: PLIST, content: INFO })).decision).toBe('allow')
})

test('replace_all is applied before comparing', async ($, on) => {
  engine = 'allow'
  world(on)
  const asked = await check($, 'Edit', { file_path: PLIST, old_string: 'OLDKEY', new_string: 'NEWKEY', replace_all: true })
  expect(asked.decision).toBe('ask')
})

test('Bash: deleting the key is denied, generate_keys without -p asks, -p passes', async ($, on) => {
  engine = 'allow'
  world(on)
  const denied = await check($, 'Bash', { command: 'security delete-generic-password -s https://sparkle-project.org' })
  expect(denied.decision).toBe('deny')
  expect(denied.reason).toContain('sparkle-guard')
  expect((await check($, 'Bash', { command: 'rtk ./bin/generate_keys' })).decision).toBe('ask')
  expect((await check($, 'Bash', { command: './bin/generate_keys -p' })).decision).toBe('allow')
  expect((await check($, 'Bash', { command: 'ls' })).decision).toBe('allow')
})

test('an engine deny is never weakened, an engine ask keeps its reason when nothing matches', async ($, on) => {
  engine = 'deny'
  world(on)
  expect((await check($, 'Bash', { command: 'generate_keys -p' })).decision).toBe('deny')
  engine = 'ask'
  const asked = await check($, 'Bash', { command: 'ls' })
  expect(asked.reason).toBe('engine')
})

test('/sparkle-guard status lists the rules', async ($, on) => {
  world(on)
  const out = (await $.command.run({ command: 'sparkle-guard', args: 'status' } as never)) as { text: string }
  expect(out.text).toContain('deny: security delete-generic-password')
  expect(out.text).toContain('ask: generate_keys -f')
  expect(out.text).toContain('SUPublicEDKey')
})
