import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  component: 'Pane',
  requestId: 'flaky-detector',
  props: { title: 'Flaky tests', isFocused: false, bodyColumns: 80, placement: 'dock' } as never,
} as const

const FAIL = { isError: true, result: undefined, text: 'Exit code 1' } as never
const OK = { result: { stdout: '', stderr: '', interrupted: false } as never }

function world(on: On, results: unknown[]) {
  const toasts: string[] = []
  on('clock.now', () => ({ value: 0 }))
  on('ui.toast', ($e, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.call', () => (results.shift() ?? OK) as never)
  return toasts
}

test('toasts once when a test fails then passes with no edit, and lists it in the pane', async ($, on) => {
  const toasts = world(on, [FAIL, OK, FAIL, OK])
  for (let i = 0; i < 4; i++) await $.tool.call({ tool: 'Bash', command: 'rtk npm test' })

  expect(toasts).toEqual(['flaky-detector: `npm test` failed then passed with no code change'])
  const ui = await $.ui.mount({ plugin: 'flaky-detector', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '1 flaky' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^npm test · 2 fail \/ 2 pass/ as never })).toBeDefined()
  await ui.unmount()
})

test('a successful Edit between failure and pass prevents the flag (test bites)', async ($, on) => {
  const toasts = world(on, [FAIL, OK, OK])
  await $.tool.call({ tool: 'Bash', command: 'pytest' })
  await $.tool.call({ tool: 'Edit', filePath: 'a.ts', oldString: 'a', newString: 'b' } as never)
  await $.tool.call({ tool: 'Bash', command: 'pytest' })

  expect(toasts).toEqual([])
  const ui = await $.ui.mount({ plugin: 'flaky-detector', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'No flaky tests detected.' })).toBeDefined()
  await ui.unmount()
})

test('edits by subagents count and non-test Bash commands are ignored', async ($, on) => {
  const toasts = world(on, [FAIL, OK, OK, FAIL, OK])
  await $.tool.call({ tool: 'Bash', command: 'vitest run' })
  await $.tool.call({ tool: 'Write', filePath: 'a.ts', content: 'x', agentId: 'sub-1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'vitest run' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(toasts).toEqual([])
})

test('/flaky opens, clear empties, close closes', async ($, on) => {
  const calls: string[] = []
  world(on, [FAIL, OK])
  on('ui.open', ($e, e) => {
    calls.push(`open:${e.id}`)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($e, e) => {
    calls.push(`close:${e.id}`)
    return { value: undefined } as never
  })
  await $.tool.call({ tool: 'Bash', command: 'go test ./...' })
  await $.tool.call({ tool: 'Bash', command: 'go test ./...' })

  const opened = await $.command.run({ command: 'flaky', args: '' } as never)
  expect('text' in opened ? opened.text : '').toContain('1 flaky')
  const cleared = await $.command.run({ command: 'flaky', args: 'clear' } as never)
  expect('text' in cleared ? cleared.text : '').toContain('cleared')
  const again = await $.command.run({ command: 'flaky', args: '' } as never)
  expect('text' in again ? again.text : '').toContain('0 flaky')
  await $.command.run({ command: 'flaky', args: 'close' } as never)
  expect(calls).toEqual(['open:flaky-detector', 'open:flaky-detector', 'close:flaky-detector'])
})
