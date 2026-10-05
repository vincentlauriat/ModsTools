import { expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PANE = {
  plugin: 'lint-watch',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'lint-watch',
  props: { title: 'Lint', isFocused: false, bodyColumns: 100, placement: 'dock' } as never,
} as const

const ran = (stdout: string, exitCode = 0): ProcessRunResult =>
  ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }) as ProcessRunResult

const swiftIssue = (file: string, severity: 'Error' | 'Warning', line = 3) => ({
  character: 1,
  file,
  line,
  reason: severity === 'Error' ? 'Force casts should be avoided' : 'Lines should not have trailing semicolons',
  rule_id: severity === 'Error' ? 'force_cast' : 'trailing_semicolon',
  severity,
  type: 'x',
})

type World = {
  installed: Set<string>
  // The JSON a linter prints for its files; '[]' when not set.
  output: (argv: readonly string[]) => string
  slowMs?: number
  failing?: boolean
}

// /dev/app: a Swift project with .swiftlint.yml; /dev/web: node project with eslint; /dev/bare: no eslint.
function world(on: On, opts: Partial<World> = {}) {
  const state: World = { installed: new Set(['swiftlint', 'npx']), output: () => '[]', ...opts }
  const files = new Set(['/dev/app/.swiftlint.yml', '/dev/app/.git', '/dev/web/node_modules/.bin/eslint', '/dev/web/.git', '/dev/bare/package.json'])
  const runs: { argv: string[]; cwd?: string }[] = []
  const which: string[] = []
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  const clock = mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.cwd', () => ({ value: '/dev' }))
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) }))
  on('process.run', async (_$, e) => {
    if (e.argv[0] === '/bin/sh') {
      const name = e.argv.at(-1) ?? ''
      which.push(name)
      return { value: state.installed.has(name) ? ran(`/usr/local/bin/${name}\n`) : ran('', 1) }
    }
    runs.push({ argv: [...e.argv], cwd: e.init?.cwd })
    if (state.slowMs !== undefined) await clock.sleep(state.slowMs)
    return { value: ran(state.output(e.argv), 2) }
  })
  on('tool.call', () => (state.failing === true ? { isError: true as const, result: 'failed' } : { result: 'ok' as never }))
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))

  return { state, runs, which, statuses, toasts, clock }
}

const edit = ($: Engine, path: string, extra: Record<string, unknown> = {}) =>
  $.tool.call({ tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b', ...extra } as never)

const command = async ($: Engine, args = '') => ((await $.command.run({ command: 'lint-watch', args } as never)) as { text: string }).text

test('edits are linted together after a 2 s pause, never before the tool result', async ($, on) => {
  const { runs, statuses, clock, state } = world(on)
  state.output = () => JSON.stringify([swiftIssue('/dev/app/Sources/A.swift', 'Error'), swiftIssue('/dev/app/Sources/B.swift', 'Warning')])
  await edit($, '/dev/app/Sources/A.swift')
  await clock.advance(1500)
  await edit($, '/dev/app/Sources/B.swift')
  await clock.advance(1500)
  expect(runs).toEqual([])
  await clock.advance(500)
  expect(runs).toEqual([
    { argv: ['swiftlint', 'lint', '--reporter', 'json', '--quiet', '/dev/app/Sources/A.swift', '/dev/app/Sources/B.swift'], cwd: '/dev/app' },
  ])
  expect(statuses.at(-1)).toBe('lint ⚠ 1 · ✗ 1')
})

test('ESLint runs through npx --no-install from the folder holding node_modules/.bin/eslint, and nowhere else', async ($, on) => {
  const { runs, clock } = world(on)
  await edit($, '/dev/web/src/deep/a.ts')
  await edit($, '/dev/bare/src/b.ts')
  await clock.advance(2000)
  expect(runs).toEqual([{ argv: ['npx', '--no-install', 'eslint', '-f', 'json', '/dev/web/src/deep/a.ts'], cwd: '/dev/web' }])
})

test('a missing linter stays silent, is looked up once, and /lint-watch names it', async ($, on) => {
  const { runs, which, statuses, clock } = world(on, { installed: new Set() })
  await edit($, '/dev/app/a.py')
  await clock.advance(2000)
  await edit($, '/dev/app/b.py')
  await clock.advance(2000)
  expect(runs).toEqual([])
  expect(statuses).toEqual([])
  expect(which).toEqual(['ruff'])
  expect(await command($)).toBe('lint-watch is on. No linter found. Not found: swiftlint, eslint, ruff, shellcheck.')
})

test('a toast only when errors appear on a file that had none', async ($, on) => {
  const { toasts, clock, state } = world(on)
  const lint = async (severity: 'Error' | 'Warning' | null) => {
    state.output = () => JSON.stringify(severity === null ? [] : [swiftIssue('/dev/app/A.swift', severity)])
    await edit($, '/dev/app/A.swift')
    await clock.advance(2000)
  }
  await lint('Error')
  await lint('Error')
  await lint(null)
  await lint('Warning')
  await lint('Error')
  expect(toasts).toEqual(['lint: ✗ 1 error in A.swift — /lint-watch', 'lint: ✗ 1 error in A.swift — /lint-watch'])
})

test('subagent edits, failed edits and files without a linter are not linted', async ($, on) => {
  const { runs, clock, state } = world(on)
  await edit($, '/dev/app/A.swift', { agentId: 'sub-1' })
  await edit($, '/dev/app/README.md')
  state.failing = true
  await edit($, '/dev/app/B.swift')
  await clock.advance(5000)
  expect(runs).toEqual([])
})

test('output that is not JSON marks the files as not linted', async ($, on) => {
  const { statuses, clock, state } = world(on)
  state.output = () => 'Error: configuration file not found'
  await edit($, '/dev/app/A.swift')
  await clock.advance(2000)
  expect(statuses.at(-1)).toBe('lint 1 not linted')
})

test('one run at a time per project: edits during a run are linted right after it', async ($, on) => {
  const { runs, clock } = world(on, { slowMs: 10_000 })
  await edit($, '/dev/app/A.swift')
  await clock.advance(2000)
  await edit($, '/dev/app/B.swift')
  await clock.advance(2000)
  expect(runs.map(one => one.argv.at(-1))).toEqual(['/dev/app/A.swift'])
  await clock.advance(10_000)
  expect(runs.map(one => one.argv.at(-1))).toEqual(['/dev/app/A.swift', '/dev/app/B.swift'])
})

test('off stops linting, on resumes, run re-lints every file edited this session', async ($, on) => {
  const { runs, statuses, clock } = world(on)
  await edit($, '/dev/app/A.swift')
  await clock.advance(2000)
  expect(await command($, 'off')).toBe('lint-watch is off.')
  expect(statuses.at(-1)).toBeUndefined()
  await edit($, '/dev/app/B.swift')
  await clock.advance(2000)
  expect(runs.length).toBe(1)
  expect(await command($, 'on')).toBe('lint-watch is on.')
  await edit($, '/dev/web/c.ts')
  await clock.advance(2000)
  expect(await command($, 'run')).toBe('lint ✓ over 2 files.')
  expect(runs.slice(-2).map(one => one.argv.slice(-2))).toEqual([['--quiet', '/dev/app/A.swift'], ['json', '/dev/web/c.ts']])
})

test('the pane lists issues as file:line rule message, errors first', async ($, on) => {
  const { clock, state } = world(on)
  state.output = () => JSON.stringify([swiftIssue('/dev/app/A.swift', 'Warning', 2), swiftIssue('/dev/app/A.swift', 'Error', 7)])
  await edit($, '/dev/app/A.swift')
  await clock.advance(2000)
  expect(await command($)).toBe('lint-watch is on. Linters found: swiftlint. Not found: eslint (no node_modules/.bin/eslint in this project), ruff, shellcheck.')
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'lint ⚠ 1 · ✗ 1 · 1 file' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✗ app/A.swift:7 force_cast Force casts should be avoided' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '⚠ app/A.swift:2 trailing_semicolon Lines should not have trailing semicolons' })).toBeDefined()
  await ui.unmount()
})
