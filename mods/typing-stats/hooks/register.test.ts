import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const NOW = new Date(2026, 9, 5, 14, 30).getTime()

// An in-memory store the test can look into (the plugin's own keys).
function world(on: On, days?: unknown) {
  const mem: Record<string, unknown> = days === undefined ? {} : { days }
  on('store.get', (_$, e) => ({ value: mem[e.key] }))
  on('store.set', (_$, e) => {
    mem[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    delete mem[e.key]

    return { value: undefined }
  })
  mock.clock(on, { now: NOW })
  on('command.register', () => ({ value: undefined as never }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))

  return mem
}

const submit = ($: Engine, text: string, kind = 'composer') => $.prompt.submit({ text, wait: false, origin: { kind } } as never)

async function stats($: Engine, args = '') {
  return (await $.command.run({ command: 'typing-stats', args } as never)).text ?? ''
}

test('typed prompts are counted with their length and hour', async ($, on) => {
  world(on)
  await submit($, 'hello world')
  await submit($, 'abc', 'bridge')
  const text = await stats($)
  expect(text).toContain('Today: 2 prompts, 14 characters (avg 7)')
  expect(text).toContain('Busiest hour: 14:00-15:00 (2 prompts)')
})

test('the prompt text itself is never stored', async ($, on) => {
  const mem = world(on)
  await submit($, 'my secret password is hunter2')
  const stored = JSON.stringify(mem)
  expect(stored).not.toContain('hunter2')
  expect(stored).toContain('"count":1')
})

test('prompts not typed by the person, and slash commands, are not counted', async ($, on) => {
  world(on)
  await submit($, 'from a task', 'task-notification')
  await submit($, 'from a plugin', 'plugin')
  await submit($, '/typing-stats week')
  expect(await stats($)).toContain('Today: 0 prompts')
})

test('week, month, reset and usage', async ($, on) => {
  world(on, { '2026-09-10': { count: 4, chars: 40, hours: Array(24).fill(0) } })
  expect(await stats($, 'week')).toContain('Last 7 days: 0 prompts')
  expect(await stats($, 'month')).toContain('Last 30 days: 4 prompts')
  expect(await stats($, 'bogus')).toContain('Usage')
  expect(await stats($, 'reset')).toBe('Typing stats reset.')
  expect(await stats($, 'month')).toContain('Last 30 days: 0 prompts')
})
