import { expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const ok = (stdout: string): ProcessRunResult =>
  ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }) as ProcessRunResult

const json = (saved: number, pct: number) => JSON.stringify({ summary: { total_saved: saved, avg_savings_pct: pct } })

// `rtk` answers `reply(argv)`; it throws when `reply` does (rtk not installed).
function world(on: On, reply: (argv: readonly string[]) => ProcessRunResult) {
  const statuses: (string | undefined)[] = []
  const runs: string[][] = []
  const clock = mock.clock(on, { now: 0 })
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    return { value: reply(e.argv) }
  })
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/p' }))
  on('command.register', () => ({ value: undefined as never }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  return { statuses, runs, clock }
}

const finish = ($: Engine, agentId?: string) =>
  $.turn.complete({ answer: 'ok', isAborted: false, turnId: 't', reason: 'answer', durationMs: 1, agentId } as never)

test('session start shows the savings from the json output', async ($, on) => {
  const { statuses, runs } = world(on, () => ok(json(1_234_567, 78.2)))
  await $.session.start({ source: 'startup' } as never)

  expect(statuses).toEqual(['rtk −1.2M tok (78%)'])
  expect(runs).toEqual([['rtk', 'gain', '--format', 'json']])
})

test('unparseable output clears the status without crashing', async ($, on) => {
  const garbage = world(on, () => ok('RTK Token Savings (Global Scope)'))
  await $.session.start({ source: 'startup' } as never)
  expect(garbage.statuses).toEqual([undefined])
})

test('a missing rtk clears the status', async ($, on) => {
  const { statuses } = world(on, () => {
    throw new Error('ENOENT')
  })
  await $.session.start({ source: 'startup' } as never)
  expect(statuses).toEqual([undefined])
})

test('a non-zero exit clears the status', async ($, on) => {
  const { statuses } = world(on, () => ({ ...ok(json(5, 5)), exitCode: 1 }))
  await $.session.start({ source: 'startup' } as never)
  expect(statuses).toEqual([undefined])
})

test('turns refresh at most every 5 minutes, and subagent turns never do', async ($, on) => {
  let saved = 1_000
  const { statuses, clock } = world(on, () => ok(json(saved, 50)))
  await $.session.start({ source: 'startup' } as never)

  saved = 2_000
  await clock.advance(60_000)
  await finish($)
  await finish($, 'sub-1')
  expect(statuses).toEqual(['rtk −1.0K tok (50%)'])

  await clock.advance(5 * 60_000)
  await finish($, 'sub-1')
  expect(statuses).toHaveLength(1)
  await finish($)
  expect(statuses).toEqual(['rtk −1.0K tok (50%)', 'rtk −2.0K tok (50%)'])
})

test('/rtk-gain returns the raw text summary and refreshes the status', async ($, on) => {
  const { statuses, runs } = world(on, argv =>
    argv.includes('json') ? ok(json(3_000, 40)) : ok('RTK Token Savings (Global Scope)\nTokens saved: 3.0K\n'),
  )
  const ran = await $.command.run({ command: 'rtk-gain', args: '' } as never)

  expect((ran as { text: string }).text).toBe('RTK Token Savings (Global Scope)\nTokens saved: 3.0K')
  expect(statuses).toEqual(['rtk −3.0K tok (40%)'])
  expect(runs).toEqual([['rtk', 'gain', '--format', 'json'], ['rtk', 'gain']])
})

test('/rtk-gain says so when rtk is unavailable', async ($, on) => {
  world(on, () => {
    throw new Error('ENOENT')
  })
  const ran = await $.command.run({ command: 'rtk-gain', args: '' } as never)
  expect((ran as { text: string }).text).toBe('rtk gain is unavailable (rtk missing or failed).')
})
