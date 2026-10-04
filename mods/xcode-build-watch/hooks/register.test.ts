import { expect, mock, test } from 'claude-code/testing'
import type { FsEntry, On, ProcessRunResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const done = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult => ({
  exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false,
})
const entries = (...names: string[]) => names.map(name => ({ name, kind: name.includes('.') ? 'file' : 'dir' }) as FsEntry)

// /dev/App holds App.xcodeproj; /dev/Pkg holds Package.swift. Every command run is logged.
function world(on: On, build: ProcessRunResult | (() => ProcessRunResult)) {
  const runs: string[][] = []
  const clock = mock.clock(on, { now: 0 })
  on('session.cwd', () => ({ value: '/dev' }))
  on('fs.list', ($, e) => {
    const tree: Record<string, FsEntry[]> = {
      '/dev/App': entries('App.xcodeproj', 'Sources'),
      '/dev/App/Sources': entries('main.swift'),
      '/dev/Pkg': entries('Package.swift', 'Sources'),
      '/dev/Pkg/Sources': entries('lib.swift'),
      '/dev/Dup': entries('Dup 2.xcodeproj', 'Dup.xcodeproj', 'Sources'),
      '/dev/Dup/Sources': entries('b.swift'),
      '/dev/Gen': entries('project.yml', 'Sources'),
      '/dev/Gen/Sources': entries('a.swift'),
    }
    return { value: tree[e.path ?? ''] ?? [] }
  })
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    if (e.argv.includes('-list')) return { value: done(JSON.stringify({ project: { schemes: ['AppTests', 'App'] } })) }
    return { value: typeof build === 'function' ? build() : build }
  })
  on('tool.call', () => ({ result: 'ok' as never }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  return { runs, clock }
}

async function turnEditing($: Engine, clock: ReturnType<typeof mock.clock>, ...files: string[]) {
  for (const file of files) await $.tool.call({ tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
  await clock.settle()
}

const status = async ($: Engine) => (await $.command.run({ command: 'build-status', args: '' } as never) as { text: string }).text

test('editing Swift in an Xcode project builds its matching scheme in Debug, unsigned', async ($, on) => {
  const { runs, clock } = world(on, done(''))
  await turnEditing($, clock, '/dev/App/Sources/main.swift', '/dev/App/Sources/main.swift')

  const builds = runs.filter(argv => argv.at(-1) === 'build')
  expect(builds).toEqual([
    ['xcodebuild', '-project', '/dev/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug', '-quiet', 'CODE_SIGNING_ALLOWED=NO', 'build'],
  ])
  expect(await status($)).toBe('✅ App builds (0s)')
})

test('a failed build reports its error lines', async ($, on) => {
  const { clock } = world(on, done('', 65, '/dev/Pkg/Sources/lib.swift:3:5: error: cannot find x in scope\nwarning: meh\n'))
  await turnEditing($, clock, '/dev/Pkg/Sources/lib.swift')

  expect(await status($)).toBe('❌ Pkg: build failed, 1 error\n/dev/Pkg/Sources/lib.swift:3:5: error: cannot find x in scope')
})

test('a Swift package is built with swift build', async ($, on) => {
  const { runs, clock } = world(on, done(''))
  await turnEditing($, clock, '/dev/Pkg/Sources/lib.swift')

  expect(runs).toEqual([['swift', 'build']])
})

test('a turn that edits no Swift file builds nothing', async ($, on) => {
  const { runs, clock } = world(on, done(''))
  await turnEditing($, clock, '/dev/App/README.md')

  expect(runs).toEqual([])
  expect(await status($)).toBe('No background build yet this session.')
})

test('an XcodeGen project without its .xcodeproj asks for xcodegen instead of building', async ($, on) => {
  const { runs, clock } = world(on, done(''))
  await turnEditing($, clock, '/dev/Gen/Sources/a.swift')

  expect(runs).toEqual([])
  expect(await status($)).toContain('run xcodegen generate first')
})

test('beside Finder copies like "Dup 2.xcodeproj", the project named after its folder is built', async ($, on) => {
  const { runs, clock } = world(on, done(''))
  await turnEditing($, clock, '/dev/Dup/Sources/b.swift')

  expect(runs.find(argv => argv.at(-1) === 'build')?.[2]).toBe('/dev/Dup/Dup.xcodeproj')
})

test("a subagent's Swift edits and Swift files outside the session's folder build nothing", async ($, on) => {
  const { runs, clock } = world(on, done(''))
  await $.tool.call({ tool: 'Edit', agentId: 'sub-1', file_path: '/dev/App/Sources/main.swift', old_string: 'a', new_string: 'b' } as never)
  await turnEditing($, clock, '/elsewhere/App/Sources/main.swift')

  expect(runs).toEqual([])
})

test('a build that cannot finish reports it instead of staying in progress', async ($, on) => {
  const { clock } = world(on, () => {
    throw new Error('timed out')
  })
  await turnEditing($, clock, '/dev/Pkg/Sources/lib.swift')

  expect(await status($)).toContain('build did not finish')
})
