import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const NIGHT = new Date(2026, 9, 4, 2, 0).getTime()
const DONE = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't' } as never

function world(on: On, state?: unknown, bash = { ok: true }) {
  const toasts: string[] = []
  mock.store(on, state === undefined ? undefined : { state })
  mock.clock(on, { now: NIGHT })
  on('command.register', () => ({ value: undefined as never }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '' }, ...(bash.ok ? {} : { isError: true }) }) as never)
  on('agent.spawn', () => ({ model: 'm', agentId: 'a' }) as never)
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined as never }
  })

  return toasts
}

async function list($: Engine, args = '') {
  return (await $.command.run({ command: 'achievements', args } as never)).text ?? ''
}

test('the first tool call toasts First Blood and persists it', async ($, on) => {
  const toasts = world(on)
  await $.tool.call({ tool: 'Read', file_path: '/x' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/x' } as never)
  expect(toasts).toEqual(['🏆 Achievement unlocked: First Blood'])
  expect(await list($)).toContain('✓ First Blood')
})

test('a main-agent turn at 2am unlocks Night Owl; a subagent turn does not', async ($, on) => {
  const toasts = world(on)
  await $.turn.complete({ ...(DONE as object), agentId: 'sub' } as never)
  expect(toasts).toEqual([])
  await $.turn.complete(DONE)
  expect(toasts).toEqual(['🏆 Achievement unlocked: Night Owl'])
})

test('five subagent spawns in a session unlock Subagent Wrangler', async ($, on) => {
  const toasts = world(on)
  for (let i = 0; i < 5; i++) await $.agent.spawn({ prompt: 'x', description: 'd' } as never)
  expect(toasts).toEqual(['🏆 Achievement unlocked: Subagent Wrangler'])
})

test('a failing then succeeding Bash command unlocks Persistent', async ($, on) => {
  const bash = { ok: false }
  const toasts = world(on, undefined, bash)
  await $.tool.call({ tool: 'Bash', command: 'make' } as never)
  expect(toasts).toEqual(['🏆 Achievement unlocked: First Blood'])
  bash.ok = true
  await $.tool.call({ tool: 'Bash', command: 'make' } as never)
  expect(toasts).toEqual(['🏆 Achievement unlocked: First Blood', '🏆 Achievement unlocked: Persistent'])
})

test('/achievements reset clears progress; unknown args print usage', async ($, on) => {
  world(on, { unlocked: ['shipper'], bash: 3, edit: 0, tools: 3, failed: [] })
  expect(await list($)).toContain('✓ Shipper')
  expect(await list($, 'bogus')).toContain('Usage')
  expect(await list($, 'reset')).toBe('Achievements reset.')
  expect(await list($)).toContain('○ Shipper')
})
