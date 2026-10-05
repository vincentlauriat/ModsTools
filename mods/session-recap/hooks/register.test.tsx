import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PANE = {
  plugin: 'session-recap',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'session-recap',
  props: { title: 'Session recap', isFocused: false, bodyColumns: 80, placement: 'dock' } as never,
} as const

type Opts = { failing?: string[]; gitThrows?: boolean; prOutput?: string }

function world(on: On, opts: Opts = {}) {
  const runs: { argv: string[]; cwd?: string }[] = []
  const opened: string[] = []
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [], cost: { usd: 2.5 } } as never }))
  on('clock.now', () => ({ value: 10 * 60_000 }))
  on('process.run', (_$, e) => {
    runs.push({ argv: [...e.argv], cwd: e.init?.cwd })
    if (opts.gitThrows === true) throw new Error('spawn failed')
    return { value: { exitCode: 0, stdout: 'deadbee feat: from git log\n', stderr: '' } as never }
  })
  on('tool.call', (_$, e) => {
    const cmd = (e as { command?: string }).command ?? ''
    if ((opts.failing ?? []).includes(cmd)) return { isError: true, result: undefined, text: 'failed' } as never
    const out = cmd.startsWith('gh pr create') ? (opts.prOutput ?? '') : ''
    return { result: { stdout: out, stderr: '', interrupted: false } as never, text: out } as never
  })
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  return { runs, opened }
}

const bash = ($: Engine, command: string, agentId?: string, extra: object = {}) =>
  $.tool.call({ tool: 'Bash', command, agentId, ...extra } as never)
const edit = ($: Engine, path: string, agentId?: string) =>
  $.tool.call({ tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b', agentId } as never)
const text = async ($: Engine) => ((await $.command.run({ command: 'recap', args: 'text' } as never)) as { text: string }).text

test('main-agent edits are listed once, relative; subagent edits are not', async ($, on) => {
  world(on)
  await edit($, '/proj/src/a.ts')
  await edit($, '/proj/src/a.ts')
  await $.tool.call({ tool: 'Write', file_path: '/elsewhere/b.md', content: 'x' } as never)
  await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/proj/n.ipynb', new_source: 'x' } as never)
  await edit($, '/proj/sub.ts', 'agent-1')
  const out = await text($)
  expect(out).toContain('### Files changed (3)')
  expect(out).toContain('- `src/a.ts`')
  expect(out).toContain('- `/elsewhere/b.md`')
  expect(out).toContain('- `n.ipynb`')
  expect(out).not.toContain('sub.ts')
  expect(out).toContain('- Duration: 10m')
  expect(out).toContain('- Cost: $2.50')
})

test('a successful commit is read back with git log in its folder', async ($, on) => {
  const { runs } = world(on)
  await bash($, 'cd app && rtk git commit -m "feat: typed subject"')
  expect(runs).toEqual([{ argv: ['git', 'log', '-1', '--format=%h %s'], cwd: '/proj/app' }])
  expect(await text($)).toContain('- `deadbee` feat: from git log')
})

test('a failed commit is not recorded; git failing falls back to the -m subject', async ($, on) => {
  world(on, { failing: ['git commit -m "nope"'], gitThrows: true })
  await bash($, 'git commit -m "nope"')
  await bash($, 'git commit -m "fix: fallback"')
  const out = await text($)
  expect(out).toContain('### Commits (1)')
  expect(out).toContain('- fix: fallback')
  expect(out).not.toContain('nope')
})

test('PRs take their URL from the output; tests count passes and failures', async ($, on) => {
  world(on, { prOutput: 'https://github.com/o/r/pull/9\n', failing: ['rtk npm test'] })
  await bash($, 'gh pr create --fill')
  await bash($, 'gh pr merge 9 --squash')
  await bash($, 'rtk npm test')
  await bash($, 'npm test')
  await bash($, 'npm test', 'agent-2')
  const out = await text($)
  expect(out).toContain('- created #9 https://github.com/o/r/pull/9')
  expect(out).toContain('- merged #9')
  expect(out).toContain('- npm test: 2 runs · 1 passed · 1 failed')
})

test('/recap opens the pane, which draws the same lines; clear empties the log', async ($, on) => {
  const { opened } = world(on)
  await edit($, '/proj/x.ts')
  await $.command.run({ command: 'recap', args: '' } as never)
  expect(opened).toEqual(['session-recap'])
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'Session recap' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '- `x.ts`' })).toBeDefined()
  await ui.unmount()
  await $.command.run({ command: 'recap', args: 'clear' } as never)
  expect(await text($)).toContain('### Files changed (0)')
})

test('background Bash calls are not counted: they return before the command ends', async ($, on) => {
  const { runs } = world(on)
  await bash($, 'npm test', undefined, { run_in_background: true })
  await bash($, 'git commit -m "later"', undefined, { run_in_background: true })
  const out = await text($)
  expect(out).toContain('### Tests & builds (0)')
  expect(out).toContain('### Commits (0)')
  expect(runs).toEqual([])
})
