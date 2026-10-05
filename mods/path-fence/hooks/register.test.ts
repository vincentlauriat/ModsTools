import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

let engine: 'allow' | 'ask' | 'deny' = 'allow'

function world(on: On) {
  mock.env(on, { HOME: '/Users/me' })
  on('session.cwd', () => ({ value: '/Users/me/proj' }))
  on('tool.check', () => ({ decision: engine }))
}

const verdict = ($: Engine, tool: string, input: object) => $.tool.check({ tool, input } as never)

test('writing outside the session folder is put to the user even when the engine would allow it', async ($, on) => {
  engine = 'allow'
  world(on)

  const outside = await verdict($, 'Write', { file_path: '/etc/hosts', content: 'x' })
  expect(outside.decision).toBe('ask')
  expect(outside.reason).toContain('path-fence')
  expect((await verdict($, 'Edit', { file_path: '/Users/me/proj/../other/a.ts' })).decision).toBe('ask')
  expect((await verdict($, 'NotebookEdit', { notebook_path: '~/n.ipynb' })).decision).toBe('ask')
  expect((await verdict($, 'Bash', { command: 'echo x > ~/.zshrc' })).decision).toBe('ask')
  expect((await verdict($, 'Write', { file_path: '/Users/me/proj/a.ts' })).decision).toBe('allow')
  expect((await verdict($, 'Write', { file_path: '/Users/me/.claude/x.md' })).decision).toBe('allow')
  expect((await verdict($, 'Write', { file_path: '/private/tmp/claude-501/s/x' })).decision).toBe('allow')
  expect((await verdict($, 'Bash', { command: 'echo x > out.txt' })).decision).toBe('allow')
  expect((await verdict($, 'Read', { file_path: '/etc/hosts' })).decision).toBe('allow')
})

test('an engine deny is never weakened', async ($, on) => {
  engine = 'deny'
  world(on)

  expect((await verdict($, 'Write', { file_path: '/etc/hosts' })).decision).toBe('deny')
})

test('allowedRoots as a comma-separated string opens extra roots', { options: { allowedRoots: '~/Shared, /opt/work' } }, async ($, on) => {
  engine = 'allow'
  world(on)

  expect((await verdict($, 'Write', { file_path: '/Users/me/Shared/a' })).decision).toBe('allow')
  expect((await verdict($, 'Write', { file_path: '/opt/work/a' })).decision).toBe('allow')
  expect((await verdict($, 'Write', { file_path: '/opt/other/a' })).decision).toBe('ask')
})

test('/path-fence off stops asking, on asks again, status reports', async ($, on) => {
  engine = 'allow'
  world(on)

  const off = await $.command.run({ command: 'path-fence', args: 'off' } as never)
  expect('text' in off ? off.text : '').toContain('OFF')
  expect((await verdict($, 'Write', { file_path: '/etc/hosts' })).decision).toBe('allow')

  await $.command.run({ command: 'path-fence', args: 'on' } as never)
  expect((await verdict($, 'Write', { file_path: '/etc/hosts' })).decision).toBe('ask')
  const status = await $.command.run({ command: 'path-fence', args: 'status' } as never)
  expect('text' in status ? status.text : '').toContain('ON')
  expect('text' in status ? status.text : '').toContain('/Users/me/proj')
})
