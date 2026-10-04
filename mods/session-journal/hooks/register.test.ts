import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const NOW = new Date(2026, 9, 4, 14, 30).getTime()
const DONE = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't' } as never

function world(on: On, entries?: unknown) {
  mock.store(on, entries === undefined ? undefined : { entries })
  mock.clock(on, { now: NOW })
  on('session.cwd', () => ({ value: '/dev/MyApp' }))
  on('command.register', () => ({ value: undefined as never }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', (_$, e) => ((e as { command?: string }).command === 'rm' ? { deny: 'no' } : { result: 'ok' as never }))
}

async function journal($: Engine, args = '') {
  const ran = await $.command.run({ command: 'journal', args } as never)

  return { text: ran.text ?? '' }
}

test('a turn records project, prompt, tool calls and distinct edited files', async ($, on) => {
  world(on)
  await $.prompt.submit({ text: 'fix the login\nmore detail' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/x/a.ts' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/x/a.ts' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/x/a.ts' } as never)
  await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/x/n.ipynb' } as never)
  await $.turn.complete(DONE)

  const text = (await journal($)).text
  expect(text).toContain('MyApp (1 turn)')
  expect(text).toContain('14:30 fix the login · 4 tools · 2 files')
})

test('subagent and denied calls are not counted; subagent turns not recorded', async ($, on) => {
  world(on)
  await $.prompt.submit({ text: 'go' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'sub' } as never)
  await $.tool.call({ tool: 'Bash', command: 'rm' } as never)
  await $.turn.complete({ ...(DONE as object), agentId: 'sub' } as never)
  expect((await journal($)).text).toContain('No journal entries')
  await $.turn.complete(DONE)
  expect((await journal($)).text).toContain('go · 0 tools · 0 files')
})

test('entries persist in the store and /journal yesterday, week, clear work', async ($, on) => {
  const old = { time: NOW - 86_400_000, project: 'Other', prompt: 'yday', tools: 1, files: 0 }
  world(on, [old])
  await $.prompt.submit({ text: 'today' } as never)
  await $.turn.complete(DONE)

  const y = (await journal($, 'yesterday')).text
  expect(y).toContain('Other (1 turn)')
  expect(y).not.toContain('today')
  const w = (await journal($, 'week')).text
  expect(w).toContain('MyApp 1')
  expect(w).toContain('Total: 2 turns')
  expect(w).toContain('Other 1')
  expect((await journal($, 'clear')).text).toBe('Journal cleared.')
  expect((await journal($)).text).toContain('No journal entries')
})

test('entries older than 30 days are pruned on the next turn', async ($, on) => {
  world(on, [{ time: NOW - 40 * 86_400_000, project: 'Old', prompt: 'x', tools: 0, files: 0 }])
  await $.turn.complete(DONE)
  const w = (await journal($, 'week')).text
  expect(w).toContain('Total: 1 turn')
  expect(w).not.toContain('Old')
})

test('unknown argument prints usage', async ($, on) => {
  world(on)
  expect((await journal($, 'bogus')).text).toContain('Usage')
})
