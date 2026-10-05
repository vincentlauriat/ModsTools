import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

type World = { percent: number | undefined; gitThrows?: boolean; todos?: string | null }

function world(on: On, w: World) {
  const toasts: string[] = []
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1, percent: w.percent }, rateLimits: [] } as never }))
  on('process.run', () => {
    if (w.gitThrows === true) throw new Error('timeout')
    return { value: { exitCode: 0, stdout: 'feat/recap\n', stderr: '' } as never }
  })
  on('fs.read', () => {
    if (w.todos === undefined || w.todos === null) throw new Error('ENOENT')
    return { value: w.todos }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: 'ok' as never }))
  return toasts
}

const done = ($: Engine, agentId?: string) =>
  $.turn.complete({ answer: 'ok', isAborted: false, turnId: 't', reason: 'answer', durationMs: 1, agentId } as never)
const prompt = ($: Engine, text: string, kind = 'composer') => $.prompt.submit({ text, wait: false, origin: { kind } } as never)
const advise = async ($: Engine) => ((await $.command.run({ command: 'compact-advisor', args: '' } as never)) as { text: string }).text

test('toasts once per crossing, re-arms below threshold - 10', async ($, on) => {
  const w: World = { percent: 80 }
  const toasts = world(on, w)
  await done($)
  expect(toasts).toEqual([])
  w.percent = 86
  await done($)
  w.percent = 90
  await done($)
  expect(toasts).toEqual(['Context 86% — /compact-advisor for a suggested /compact'])
  w.percent = 76
  await done($)
  w.percent = 88
  await done($)
  expect(toasts.length).toBe(1)
  w.percent = 70
  await done($)
  w.percent = 87
  await done($)
  expect(toasts.length).toBe(2)
})

test('subagent turns are ignored', async ($, on) => {
  const toasts = world(on, { percent: 99 })
  await done($, 'agent-1')
  expect(toasts).toEqual([])
})

test('the threshold comes from userConfig', { options: { threshold: 50 } }, async ($, on) => {
  const toasts = world(on, { percent: 55 })
  await done($)
  expect(toasts).toEqual(['Context 55% — /compact-advisor for a suggested /compact'])
})

test('/compact-advisor builds the line from branch, main edits, TODOS.md and the last typed prompt', async ($, on) => {
  world(on, { percent: 10, todos: '- [ ] write README\n- [x] old\n- [ ] run tests\n- [ ] ship\n- [ ] later\n' })
  await prompt($, 'Build the recap mod\nwith details')
  await prompt($, '/compact-advisor')
  await prompt($, 'notification text', 'task-notification')
  await $.tool.call({ tool: 'Edit', file_path: '/proj/a.ts', old_string: 'x', new_string: 'y' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/proj/b.ts', content: 'x' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/proj/sub.ts', old_string: 'x', new_string: 'y', agentId: 'a1' } as never)
  expect(await advise($)).toBe(
    '/compact Keep: branch feat/recap; files edited: a.ts, b.ts; open tasks: write README | run tests | ship; last decision/goal: Build the recap mod',
  )
})

test('git failing and no TODOS.md leave those parts out', async ($, on) => {
  world(on, { percent: 10, gitThrows: true })
  await prompt($, 'Refactor parser')
  expect(await advise($)).toBe('/compact Keep: last decision/goal: Refactor parser')
})
