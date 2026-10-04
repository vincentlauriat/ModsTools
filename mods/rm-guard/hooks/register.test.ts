import { expect, test } from 'claude-code/testing'

let engine: 'allow' | 'ask' | 'deny' = 'allow'

const verdict = ($: { tool: { check: (i: never) => Promise<{ decision: string; reason?: string }> } }, command: string) =>
  $.tool.check({ tool: 'Bash', input: { command } } as never)

test('a destructive command is put to the user even when the engine would allow it', async ($, on) => {
  engine = 'allow'
  on('tool.check', () => ({ decision: engine }))

  const asked = await verdict($, 'rm -rf src')
  expect(asked.decision).toBe('ask')
  expect(asked.reason).toContain('rm-guard')
  expect((await verdict($, 'git reset --hard')).decision).toBe('ask')
  expect((await verdict($, 'rm file.txt')).decision).toBe('allow')
  expect((await verdict($, 'rm -rf /tmp/scratch')).decision).toBe('allow')
})

test('an engine deny is never weakened', async ($, on) => {
  engine = 'deny'
  on('tool.check', () => ({ decision: engine, reason: 'no' }))

  expect((await verdict($, 'rm -rf src')).decision).toBe('deny')
})

test('other tools are left alone', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  const result = await $.tool.check({ tool: 'Write', input: { file_path: '/x', content: 'rm -rf src' } })
  expect(result.decision).toBe('allow')
})

test('/rm-guard off stops asking, /rm-guard on asks again', async ($, on) => {
  engine = 'allow'
  on('tool.check', () => ({ decision: engine }))

  const off = await $.command.run({ command: 'rm-guard', args: 'off' } as never)
  expect('text' in off ? off.text : '').toContain('OFF')
  expect((await verdict($, 'rm -rf src')).decision).toBe('allow')

  await $.command.run({ command: 'rm-guard', args: 'on' } as never)
  expect((await verdict($, 'rm -rf src')).decision).toBe('ask')
  const status = await $.command.run({ command: 'rm-guard', args: 'status' } as never)
  expect('text' in status ? status.text : '').toContain('ON')
})
