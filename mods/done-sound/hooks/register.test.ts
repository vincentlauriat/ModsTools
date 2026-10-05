import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

function world(on: On, fails = false) {
  const played: string[] = []
  const clock = mock.clock(on, { now: 0 })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.register', () => ({ value: undefined as never }))
  on('audio.play', (_$, e) => {
    if (fails) throw new Error('no player')
    played.push(e.clip.asset ?? '')
    return { value: undefined }
  })
  return { played, clock }
}

const complete = (agentId?: string) => ({ answer: 'done', isAborted: false, turnId: 't', reason: 'answer', agentId }) as never
const run = async ($: Engine, args: string) =>
  (await $.command.run({ command: 'done-sound', args } as never)) as unknown as { text: string }

async function turn($: Engine, clock: ReturnType<typeof mock.clock>, ms: number, agentId?: string) {
  await $.prompt.submit({ text: 'go' } as never)
  await clock.advance(ms)
  await $.turn.complete(complete(agentId))
}

test('a turn of 30s or more plays the chime, a shorter one stays silent', async ($, on) => {
  const { played, clock } = world(on)
  await turn($, clock, 29_000)
  expect(played).toEqual([])
  await turn($, clock, 30_000)
  expect(played).toEqual(['sounds/done.wav'])
})

test('minSeconds from userConfig moves the threshold', { options: { minSeconds: 10 } }, async ($, on) => {
  const { played, clock } = world(on)
  await turn($, clock, 9_000)
  expect(played).toEqual([])
  await turn($, clock, 12_000)
  expect(played).toHaveLength(1)
})

test('subagent completions never play', async ($, on) => {
  const { played, clock } = world(on)
  await turn($, clock, 60_000, 'sub-1')
  expect(played).toEqual([])
})

test('/done-sound off silences, on restores, test plays at once', async ($, on) => {
  const { played, clock } = world(on)
  expect((await run($, 'off')).text).toBe('done-sound off.')
  await turn($, clock, 60_000)
  expect(played).toEqual([])
  expect((await run($, 'on')).text).toBe('done-sound on.')
  await turn($, clock, 60_000)
  expect(played).toHaveLength(1)
  expect((await run($, 'test')).text).toBe('done-sound: played.')
  expect(played).toHaveLength(2)
})

test('an unavailable player never throws', async ($, on) => {
  const { clock } = world(on, true)
  await turn($, clock, 60_000)
  expect((await run($, 'test')).text).toBe('done-sound: audio unavailable.')
})
