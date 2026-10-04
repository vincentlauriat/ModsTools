import { expect, test } from 'claude-code/testing'

let engine: 'allow' | 'ask' | 'deny' = 'allow'

const verdict = ($: { tool: { check: (i: never) => Promise<{ decision: string; reason?: string }> } }, tool: string, input: object) =>
  $.tool.check({ tool, input } as never)

test('reading a secret file is put to the user even when the engine would allow it', async ($, on) => {
  engine = 'allow'
  on('tool.check', () => ({ decision: engine }))

  const read = await verdict($, 'Read', { file_path: '/p/.env' })
  expect(read.decision).toBe('ask')
  expect(read.reason).toContain('env-protect')
  expect((await verdict($, 'Bash', { command: 'cat .env' })).decision).toBe('ask')
  expect((await verdict($, 'Grep', { pattern: 'K', path: '/p/.env.local' })).decision).toBe('ask')
  expect((await verdict($, 'Glob', { pattern: '**/*.pem' })).decision).toBe('ask')
  expect((await verdict($, 'Read', { file_path: '/p/.env.example' })).decision).toBe('allow')
  expect((await verdict($, 'Bash', { command: 'cat README.md' })).decision).toBe('allow')
})

test('an engine deny is never weakened', async ($, on) => {
  on('tool.check', () => ({ decision: 'deny', reason: 'no' }))

  expect((await verdict($, 'Read', { file_path: '/p/.env' })).decision).toBe('deny')
})

test('other tools are left alone', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  expect((await verdict($, 'Write', { file_path: '/p/.env', content: 'A=1' })).decision).toBe('allow')
})

test('/env-protect off stops asking, on asks again, status reports', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  const off = await $.command.run({ command: 'env-protect', args: 'off' } as never)
  expect('text' in off ? off.text : '').toContain('OFF')
  expect((await verdict($, 'Read', { file_path: '/p/.env' })).decision).toBe('allow')

  await $.command.run({ command: 'env-protect', args: 'on' } as never)
  expect((await verdict($, 'Read', { file_path: '/p/.env' })).decision).toBe('ask')
  const status = await $.command.run({ command: 'env-protect', args: 'status' } as never)
  expect('text' in status ? status.text : '').toContain('ON')
})
