import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

type Opts = { result?: unknown; status?: string }

function world(on: On, opts: Opts = {}) {
  const toasts: string[] = []
  const runs: { argv: string[]; cwd: string | undefined }[] = []
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: (opts.result ?? 'ok') as never }))
  on('process.run', (_$, e) => {
    runs.push({ argv: [...e.argv], cwd: e.init?.cwd })
    return { value: { exitCode: 0, stdout: opts.status ?? '', stderr: '' } as never }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { toasts, runs }
}

const PIPE = 'npm run build | tail -3; echo $?'

async function bash($: Engine, command: string, agentId?: string) {
  return $.tool.call({ tool: 'Bash', command, agentId } as never)
}

const run = async ($: Engine, args: string) => ((await $.command.run({ command: 'probe-check', args } as never)) as { text: string }).text

test('a pipeline probe raises a toast and the command still runs untouched', async ($, on) => {
  const { toasts } = world(on)
  await $.prompt.submit({ text: 'go' } as never)
  const result = await bash($, PIPE)
  expect(result).toEqual({ result: 'ok' })
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/^probe-check: .*PIPESTATUS/)
})

test('clean commands stay quiet', async ($, on) => {
  const { toasts } = world(on)
  await $.prompt.submit({ text: 'go' } as never)
  await bash($, 'swift build > /dev/null 2>&1; echo $?')
  await bash($, 'set -o pipefail; make | tail; echo $?')
  expect(toasts).toEqual([])
})

test('the same pattern toasts once per turn, again on the next turn', async ($, on) => {
  const { toasts } = world(on)
  await $.prompt.submit({ text: 'go' } as never)
  await bash($, PIPE)
  await bash($, 'make | tail; echo $?')
  expect(toasts).toHaveLength(1)
  await bash($, 'x=$(a | b); echo $?')
  expect(toasts).toHaveLength(2)
  await $.prompt.submit({ text: 'again' } as never)
  await bash($, PIPE)
  expect(toasts).toHaveLength(3)
})

const NOTHING = { stdout: '', stderr: '' }
const GREP = 'git grep -n -e "@x" -- mods/new'
const UNTRACKED = '?? mods/new/a.ts\n?? mods/new/b.ts\n M other.ts\n'

test('git grep finding nothing while untracked files exist toasts and lists the finding', async ($, on) => {
  const { toasts, runs } = world(on, { result: NOTHING, status: UNTRACKED })
  await $.prompt.submit({ text: 'go' } as never)
  await bash($, GREP)
  expect(toasts).toEqual(['probe-check: git grep found nothing, but 2 untracked file(s) in that path were not searched — use grep -r'])
  expect(runs).toEqual([{ argv: ['git', 'status', '--porcelain', '--untracked-files=all', '--', 'mods/new'], cwd: undefined }])
  expect(await run($, 'list')).toContain('[git-grep-untracked]')
})

test('git grep -C runs the status in that directory', async ($, on) => {
  const { runs } = world(on, { result: NOTHING, status: UNTRACKED })
  await $.prompt.submit({ text: 'go' } as never)
  await bash($, 'git -C /repo grep foo')
  expect(runs[0]?.cwd).toBe('/repo')
})

test('git grep finding nothing with no untracked files stays silent', async ($, on) => {
  const { toasts, runs } = world(on, { result: NOTHING, status: ' M other.ts\n' })
  await $.prompt.submit({ text: 'go' } as never)
  await bash($, GREP)
  expect(runs).toHaveLength(1)
  expect(toasts).toEqual([])
})

test('git grep that matched, or --untracked, never asks git status', async ($, on) => {
  const { toasts, runs } = world(on, { result: { stdout: 'mods/x.ts:1:@x', stderr: '' }, status: UNTRACKED })
  await $.prompt.submit({ text: 'go' } as never)
  await bash($, GREP)
  await bash($, 'git grep --untracked foo')
  await bash($, 'git grep --no-index foo')
  expect(runs).toEqual([])
  expect(toasts).toEqual([])
})

test('subagent commands are ignored', async ($, on) => {
  const { toasts } = world(on)
  await $.prompt.submit({ text: 'go' } as never)
  await bash($, PIPE, 'sub')
  expect(toasts).toEqual([])
  expect(await run($, 'list')).toContain('No misleading probe')
})

test('list shows the last 10 findings newest first', async ($, on) => {
  world(on)
  await $.prompt.submit({ text: 'go' } as never)
  for (let i = 0; i < 12; i++) await bash($, `make${i} | tail; echo $?`)
  const text = await run($, '')
  expect(text).toContain('Last 10 finding(s)')
  expect(text).toContain('make11')
  expect(text).not.toContain('make1 ')
  expect(text.split('\n').filter(line => line.startsWith('- [pipe-status]'))).toHaveLength(10)
})

test('off silences it, on restores it', async ($, on) => {
  const { toasts } = world(on)
  await $.prompt.submit({ text: 'go' } as never)
  expect(await run($, 'off')).toBe('probe-check is off.')
  await bash($, PIPE)
  expect(toasts).toEqual([])
  expect(await run($, 'on')).toBe('probe-check is on.')
  await bash($, PIPE)
  expect(toasts).toHaveLength(1)
})
