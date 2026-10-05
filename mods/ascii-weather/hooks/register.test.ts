import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

type Run = { exitCode: number; stdout: string }

function world(on: On, run: (argv: string[]) => Run | 'throw') {
  const statuses: (string | undefined)[] = []
  const calls: string[][] = []
  const clock = mock.clock(on, { now: 0 })
  on('session.start', () => ({ cwd: '/p' }))
  on('command.register', () => ({ value: undefined as never }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    calls.push(argv)
    const out = run(argv)
    if (out === 'throw') throw new Error('timeout')
    return { value: { ...out, stderr: '' } as never }
  })
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  return { statuses, calls, clock }
}

const ok = (stdout: string): Run => ({ exitCode: 0, stdout })
const done = ($: Engine, agentId?: string) =>
  $.turn.complete({ answer: 'done', isAborted: false, turnId: 't', reason: 'answer', agentId } as never)
const start = ($: Engine) => $.session.start({ source: 'startup' } as never)

test('session.start fetches and shows the normalised weather', async ($, on) => {
  const { statuses, calls } = world(on, () => ok('☀️  Paris +21°C\n'))
  await start($)
  expect(statuses.at(-1)).toBe('☀️ Paris +21°C')
  expect(calls[0]?.slice(0, 3)).toEqual(['curl', '-s', '-m'])
  expect(calls[0]?.at(-1)).toBe('https://wttr.in/?format=%25c%2B%25l%2B%25t&m')
})

test('the location comes from userConfig', { options: { location: 'Lyon' } }, async ($, on) => {
  const { calls } = world(on, () => ok('☁️  Lyon +15°C'))
  await start($)
  expect(calls[0]?.at(-1)).toContain('https://wttr.in/Lyon?')
})

test('refreshes on turn.complete at most once an hour, never for subagents', async ($, on) => {
  const { calls, clock } = world(on, () => ok('☀️  Paris +21°C'))
  await start($)
  await clock.advance(30 * 60_000)
  await done($)
  await clock.advance(31 * 60_000)
  await done($, 'agent-1')
  expect(calls.length).toBe(1)
  await done($)
  expect(calls.length).toBe(2)
  await done($)
  expect(calls.length).toBe(2)
})

test('a failure or HTML clears the status and is not retried before the hour', async ($, on) => {
  let mode: 'good' | 'html' | 'throw' = 'good'
  const { statuses, calls, clock } = world(on, () =>
    mode === 'throw' ? 'throw' : ok(mode === 'html' ? '<html>oops</html>' : '☀️  Paris +21°C'),
  )
  await start($)
  expect(statuses.at(-1)).toBe('☀️ Paris +21°C')
  mode = 'throw'
  await clock.advance(61 * 60_000)
  await done($)
  expect(statuses.at(-1)).toBeUndefined()
  mode = 'good'
  await clock.advance(61 * 60_000)
  await done($)
  expect(statuses.at(-1)).toBe('☀️ Paris +21°C')
  mode = 'html'
  await clock.advance(61 * 60_000)
  await done($)
  expect(statuses.at(-1)).toBeUndefined()
  await done($)
  expect(calls.length).toBe(4)
})

test('a failed start does not retry on every turn', async ($, on) => {
  const { calls } = world(on, () => 'throw')
  await start($)
  await done($)
  await done($)
  expect(calls.length).toBe(1)
})

test('/weather shows the format=3 forecast, or a message when unavailable', async ($, on) => {
  let out: Run = ok('Paris: ☀️  +21°C\n')
  const { calls } = world(on, () => out)
  const run = async () => ((await $.command.run({ command: 'weather', args: '' } as never)) as { text: string }).text
  expect(await run()).toBe('Paris: ☀️ +21°C')
  expect(calls[0]?.at(-1)).toBe('https://wttr.in/?format=3&m')
  out = ok('Unknown location')
  expect(await run()).toContain('unavailable')
})
