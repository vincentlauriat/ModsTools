import { expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const HOME = '/home/u'
const BAND = {
  plugin: 'xcodegen-sync',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false } as never,
} as const
const APP = 'XcodeGen: project.yml or Swift files changed in /dev/app — run xcodegen generate'
const LIB = 'XcodeGen: project.yml or Swift files changed in /dev/lib — run xcodegen generate'

const ran = (exitCode: number, stdout = '', stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false }) as ProcessRunResult

type Opts = { failing?: boolean; xcodegen?: 'ok' | 'fail' | 'missing' }

// Projects /dev/app and /dev/lib (each with a project.yml); /dev/loose has none.
function world(on: On, opts: Opts = {}) {
  const files = new Set(['/dev/app/project.yml', '/dev/app/Sources/Old.swift', '/dev/lib/project.yml', '/dev/loose/X.swift'])
  const runs: { argv: string[]; cwd?: string }[] = []
  const toasts: string[] = []
  mock.store(on)
  on('session.cwd', () => ({ value: '/dev/app' }))
  on('env.get', () => ({ value: HOME }))
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) }))
  on('tool.call', (_$, e) => {
    if (opts.failing) return { isError: true as const, result: 'failed' }
    if (e.tool === 'Write') files.add(e.file_path)
    return { result: 'ok' as never }
  })
  on('process.run', (_$, e) => {
    runs.push({ argv: [...e.argv], cwd: e.init?.cwd })
    if (opts.xcodegen === 'missing') throw new Error('spawn failed')
    if (opts.xcodegen === 'fail') return { value: ran(1, 'Loading project.yml\n', '\nSpec validation error: target App\nmore\n') }
    return { value: ran(0, 'Created project at App.xcodeproj\n') }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  return { runs, toasts, files }
}

const call = ($: Engine, input: Record<string, unknown>) => $.tool.call(input as never)
const writeFile = (path: string, extra: Record<string, unknown> = {}) => ({ tool: 'Write', file_path: path, content: 'x', ...extra })
const editFile = (path: string) => ({ tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b' })
const bash = (command: string) => ({ tool: 'Bash', command })

async function bandTexts($: Engine): Promise<string[]> {
  const ui = await $.ui.mount(BAND)
  const found: string[] = []
  for (const text of [APP, LIB]) if ((await ui.find({ type: 'Text', text: new RegExp(`^${text}`) })) !== undefined) found.push(text)
  if ((await ui.find({ type: 'Text', text: 'engine' })) !== undefined) found.push('engine')
  await ui.unmount()

  return found
}

const command = async ($: Engine, args: string) => ((await $.command.run({ command: 'xcodegen-sync', args } as never)) as { text: string }).text

test('a Write creating a new Swift file raises the band for the project folder', async ($, on) => {
  world(on)
  await call($, writeFile('/dev/app/Sources/New/Feature.swift'))
  expect(await bandTexts($)).toEqual([APP])
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Button', key: 'run:/dev/app', text: 'Run xcodegen' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'dismiss:/dev/app', text: 'Dismiss' })).toBeDefined()
  await ui.unmount()
})

test('rewriting or editing an existing Swift file stays quiet', async ($, on) => {
  world(on)
  await call($, writeFile('/dev/app/Sources/Old.swift'))
  await call($, editFile('/dev/app/Sources/Old.swift'))
  await call($, writeFile('/dev/app/README.md'))
  expect(await bandTexts($)).toEqual(['engine'])
})

test('an edit of project.yml raises the band', async ($, on) => {
  world(on)
  await call($, editFile('/dev/app/project.yml'))
  expect(await bandTexts($)).toEqual([APP])
})

test('rm, git rm and mv of Swift files raise the band, one row per project', async ($, on) => {
  world(on)
  await call($, bash('rtk git rm Sources/Old.swift'))
  await call($, bash('cd /dev/lib/Sources && mv A.swift B.swift'))
  await call($, bash('rm /dev/lib/Sources/C.swift'))
  expect(await bandTexts($)).toEqual([APP, LIB])
  expect(await command($, 'status')).toBe('xcodegen-sync is on; waiting: /dev/app, /dev/lib.')
})

test('nothing happens outside a project, for subagents, or when the call failed', async ($, on) => {
  world(on)
  await call($, writeFile('/dev/loose/New.swift'))
  await call($, writeFile('/dev/app/Sources/Sub.swift', { agentId: 'agent-1' }))
  await call($, bash('rm notes.md'))
  expect(await bandTexts($)).toEqual(['engine'])
})

test('a failed tool call does not raise the band', async ($, on) => {
  world(on, { failing: true })
  await call($, editFile('/dev/app/project.yml'))
  await call($, bash('rm Sources/Old.swift'))
  expect(await bandTexts($)).toEqual(['engine'])
})

test('a successful xcodegen generate run by Bash clears its folder only', async ($, on) => {
  world(on)
  await call($, editFile('/dev/app/project.yml'))
  await call($, editFile('/dev/lib/project.yml'))
  await call($, bash('cd /dev/lib && rtk xcodegen generate'))
  expect(await bandTexts($)).toEqual([APP])
  await call($, bash('xcodegen generate'))
  expect(await bandTexts($)).toEqual(['engine'])
})

test('a failing xcodegen generate run by Bash keeps the band', async ($, on) => {
  const opts: Opts = {}
  world(on, opts)
  await call($, editFile('/dev/app/project.yml'))
  opts.failing = true
  await call($, bash('xcodegen generate'))
  expect(await bandTexts($)).toEqual([APP])
})

test('Run xcodegen runs it in the folder, toasts ok and clears the row', async ($, on) => {
  const { runs, toasts } = world(on)
  await call($, editFile('/dev/app/project.yml'))
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'run:/dev/app' })
  await ui.unmount()
  expect(runs).toEqual([{ argv: ['xcodegen', 'generate'], cwd: '/dev/app' }])
  expect(toasts).toEqual(['xcodegen: generated /dev/app'])
  expect(await bandTexts($)).toEqual(['engine'])
})

test('Run xcodegen that fails toasts the first error line and keeps the row', async ($, on) => {
  const { toasts } = world(on, { xcodegen: 'fail' })
  await call($, editFile('/dev/app/project.yml'))
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'run:/dev/app' })
  await ui.unmount()
  expect(toasts).toEqual(['xcodegen failed in /dev/app: Spec validation error: target App'])
  expect(await bandTexts($)).toEqual([APP])
})

test('Run xcodegen that cannot start toasts and keeps the row', async ($, on) => {
  const { toasts } = world(on, { xcodegen: 'missing' })
  await call($, editFile('/dev/app/project.yml'))
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'run:/dev/app' })
  await ui.unmount()
  expect(toasts).toEqual(['xcodegen could not run in /dev/app (not installed, or over 60s)'])
  expect(await bandTexts($)).toEqual([APP])
})

test('Dismiss clears one row', async ($, on) => {
  world(on)
  await call($, editFile('/dev/app/project.yml'))
  await call($, editFile('/dev/lib/project.yml'))
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'dismiss:/dev/app' })
  await ui.unmount()
  expect(await bandTexts($)).toEqual([LIB])
})

test('/xcodegen-sync off clears and stops tracking; on resumes', async ($, on) => {
  world(on)
  await call($, editFile('/dev/app/project.yml'))
  expect(await command($, 'off')).toBe('xcodegen-sync is off; no folder waiting.')
  await call($, editFile('/dev/app/project.yml'))
  expect(await bandTexts($)).toEqual(['engine'])
  expect(await command($, 'on')).toBe('xcodegen-sync is on; no folder waiting.')
  await call($, editFile('/dev/app/project.yml'))
  expect(await bandTexts($)).toEqual([APP])
})
