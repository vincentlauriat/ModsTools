import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const ID = '2efe2717-52ef-43a5-96dc-0797e4ca1041'
const ID2 = '7c1d0e42-9a3b-4f6e-8d2c-5b4a39e8f170'
const SECRET = 's3cr3t-fake-password'
const SUBMIT = 'cd release && rtk xcrun notarytool submit App.zip --keychain-profile MyNotaryProfile --output-format json'

type Bash = { stdout: string; isError?: boolean }

function world(on: On) {
  const w = {
    clock: mock.clock(on, { now: 0 }),
    calls: [] as string[][],
    toasts: [] as string[],
    statuses: [] as (string | undefined)[],
    info: new Map<string, string>(),
    infoFails: false,
    bash: { stdout: '' } as Bash,
    stored: [] as string[],
  }
  on('store.set', (_$, e) => {
    w.stored.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('state.set', (_$, e) => {
    w.stored.push(JSON.stringify(e))
    return { value: undefined } as never
  })
  on('session.start', () => ({ cwd: '/p' }))
  on('command.register', () => ({ value: undefined as never }))
  on('tool.call', () => ({ result: { stdout: w.bash.stdout, stderr: '', interrupted: false }, ...(w.bash.isError === true ? { isError: true } : {}) }) as never)
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    w.calls.push(argv)
    if (w.infoFails) throw new Error('timeout')
    const status = w.info.get(argv[3]!) ?? 'In Progress'
    return { value: { exitCode: 0, stdout: JSON.stringify({ id: argv[3], status, message: 'Successfully received submission info' }), stderr: '' } as never }
  })
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    w.statuses.push(e.text)
    return { value: undefined }
  })
  return w
}

const bash = ($: Engine, command: string, agentId?: string) => $.tool.call({ tool: 'Bash', command, ...(agentId === undefined ? {} : { agentId }) } as never)
const uploaded = (id: string) => JSON.stringify({ message: 'Successfully uploaded file', id, path: '/p/release/App.zip' })
const listing = async ($: Engine, args = '') => ((await $.command.run({ command: 'notary-watch', args } as never)) as { text: string }).text

test('a submit without --wait shows the status line and polls notarytool info every 60s with the same auth', async ($, on) => {
  const w = world(on)
  w.bash = { stdout: uploaded(ID) }
  await bash($, SUBMIT)
  expect(w.statuses.at(-1)).toBe('notary: 2efe2717 In Progress')
  expect(w.calls).toEqual([])

  await w.clock.advance(60_000)
  expect(w.calls).toEqual([['xcrun', 'notarytool', 'info', ID, '--keychain-profile', 'MyNotaryProfile', '--output-format', 'json']])
  expect(w.statuses.at(-1)).toBe('notary: 2efe2717 In Progress')

  w.info.set(ID, 'Accepted')
  await w.clock.advance(60_000)
  expect(w.toasts).toEqual(['notary ✓ accepted — now staple (2efe2717)'])
  expect(w.statuses.at(-1)).toBeUndefined()
  await w.clock.advance(5 * 60_000)
  expect(w.calls.length).toBe(2)
})

test('Invalid or Rejected toasts the log hint, without auth, and stops', async ($, on) => {
  const w = world(on)
  w.bash = { stdout: uploaded(ID) }
  await bash($, SUBMIT)
  w.info.set(ID, 'Invalid')
  await w.clock.advance(60_000)
  expect(w.toasts).toEqual([`notary ✗ invalid (2efe2717) — see why: xcrun notarytool log ${ID} <auth>`])
  expect(w.statuses.at(-1)).toBeUndefined()
})

test('the normal (non-JSON) output is read by its id: label', async ($, on) => {
  const w = world(on)
  w.bash = { stdout: `Conducting pre-submission checks for App.zip...\nSubmission ID received\n  id: ${ID}\nSuccessfully uploaded file\n  id: ${ID}\n  path: /p/App.zip\n` }
  await bash($, 'xcrun notarytool submit App.zip -p MyNotaryProfile')
  expect(w.statuses.at(-1)).toBe('notary: 2efe2717 In Progress')
})

test('--wait takes the final status from the output, toasts it and never polls', async ($, on) => {
  const w = world(on)
  w.bash = { stdout: JSON.stringify({ status: 'Accepted', message: 'Processing complete', id: ID }) }
  await bash($, `${SUBMIT} --wait`)
  expect(w.toasts).toEqual(['notary ✓ accepted — now staple (2efe2717)'])
  w.bash = { stdout: JSON.stringify({ status: 'Rejected', message: 'Processing complete', id: ID2 }), isError: true }
  await bash($, `${SUBMIT} --wait`)
  expect(w.toasts.at(-1)).toBe(`notary ✗ rejected (7c1d0e42) — see why: xcrun notarytool log ${ID2} <auth>`)
  await w.clock.advance(10 * 60_000)
  expect(w.calls).toEqual([])
  expect(w.statuses.filter(s => s !== undefined)).toEqual([])
})

test('--wait cut short by --timeout (still In Progress) falls back to polling', async ($, on) => {
  const w = world(on)
  w.bash = { stdout: JSON.stringify({ status: 'In Progress', message: 'Timeout', id: ID }), isError: true }
  await bash($, `${SUBMIT} --wait --timeout 1m`)
  expect(w.toasts).toEqual([])
  expect(w.statuses.at(-1)).toBe('notary: 2efe2717 In Progress')
})

test('subagents, failed calls and other commands are ignored', async ($, on) => {
  const w = world(on)
  w.bash = { stdout: uploaded(ID) }
  await bash($, SUBMIT, 'agent-1')
  await bash($, `echo "${SUBMIT}"`)
  await bash($, 'xcrun notarytool history -p MyNotaryProfile')
  w.bash = { stdout: uploaded(ID), isError: true }
  await bash($, SUBMIT)
  expect(w.statuses).toEqual([])
  expect(await listing($)).toBe('No notarization submission tracked this session.')
})

test('auth from shell variables is tracked but not polled, and says so', async ($, on) => {
  const w = world(on)
  w.bash = { stdout: uploaded(ID) }
  await bash($, 'xcrun notarytool submit App.zip --keychain-profile "$NOTARY_PROFILE" -f json')
  expect(w.toasts).toEqual([`notary: 2efe2717 submitted — not polled (auth comes from the shell or a prompt); check with xcrun notarytool info ${ID} <auth>`])
  await w.clock.advance(5 * 60_000)
  expect(w.calls).toEqual([])
  expect(await listing($)).toBe(`${ID} · App.zip · In Progress · 5 min · not polled`)
})

test('the password never reaches the store, a toast, the status line or /notary-watch (test bites)', async ($, on) => {
  const w = world(on)
  w.bash = { stdout: uploaded(ID) }
  await bash($, `xcrun notarytool submit App.zip --apple-id dev@example.com --team-id TEAMID1234 --password ${SECRET} -f json`)
  await w.clock.advance(60_000)
  expect(w.calls[0]).toEqual(['xcrun', 'notarytool', 'info', ID, '--apple-id', 'dev@example.com', '--team-id', 'TEAMID1234', '--password', SECRET, '--output-format', 'json'])
  const whilePolling = await listing($)
  w.info.set(ID, 'Invalid')
  await w.clock.advance(60_000)
  const seen = [...w.stored, ...w.toasts, ...w.statuses.map(String), whilePolling, await listing($)].join('\n')
  expect(w.toasts.length).toBe(1)
  expect(seen).not.toContain(SECRET)
  expect(seen).not.toContain('TEAMID1234')
  expect(seen).not.toContain('dev@example.com')
})

test('transient poll failures keep polling; after 2h it gives up', async ($, on) => {
  const w = world(on)
  w.infoFails = true
  w.bash = { stdout: uploaded(ID) }
  await bash($, SUBMIT)
  await w.clock.advance(60 * 60_000)
  expect(w.calls.length).toBe(60)
  expect(w.statuses.at(-1)).toBe('notary: 2efe2717 In Progress')
  await w.clock.advance(60 * 60_000)
  expect(w.toasts).toEqual(['notary: stopped watching 2efe2717 after 2h (still In Progress)'])
  expect(w.statuses.at(-1)).toBeUndefined()
  const polls = w.calls.length
  await w.clock.advance(10 * 60_000)
  expect(w.calls.length).toBe(polls)
})

test('two submissions share one timer; /notary-watch lists them and stop ends polling', async ($, on) => {
  const w = world(on)
  w.bash = { stdout: uploaded(ID) }
  await bash($, SUBMIT)
  w.bash = { stdout: uploaded(ID2) }
  await bash($, SUBMIT)
  expect(w.statuses.at(-1)).toBe('notary: 2 in progress')
  await w.clock.advance(60_000)
  expect(w.calls.map(c => c[3])).toEqual([ID, ID2])
  expect(await listing($)).toBe([`${ID} · App.zip · In Progress · 1 min · polling`, `${ID2} · App.zip · In Progress · 1 min · polling`].join('\n'))

  expect(await listing($, 'stop')).toBe('Stopped polling 2 submissions.')
  expect(w.statuses.at(-1)).toBeUndefined()
  await w.clock.advance(5 * 60_000)
  expect(w.calls.length).toBe(2)
  expect(await listing($)).toContain(`${ID} · App.zip · In Progress · 6 min · stopped`)
})
