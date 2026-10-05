import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const ID = '2efe2717-52ef-43a5-96dc-0797e4ca1041'
const ID2 = '7c1d0e42-9a3b-4f6e-8d2c-5b4a39e8f170'
const SECRET = 's3cr3t-fake-password'
const SUBMIT = 'cd release && rtk xcrun notarytool submit App.zip --keychain-profile MyNotaryProfile --output-format json'

type Bash = { stdout: string; isError?: boolean; backgroundTaskId?: string }
type Sub = { createdDate: string; id: string; name: string; status: string }

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
    files: new Map<string, string>(),
    history: [] as Sub[],
    historyFails: false,
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
  on('tool.call', () =>
    ({
      result: { stdout: w.bash.stdout, stderr: '', interrupted: false, ...(w.bash.backgroundTaskId === undefined ? {} : { backgroundTaskId: w.bash.backgroundTaskId }) },
      ...(w.bash.isError === true ? { isError: true } : {}),
    }) as never,
  )
  on('fs.read', (_$, e) => {
    // The engine hands a relative path over resolved against the session folder.
    const key = [...w.files.keys()].find(name => e.path === name || e.path.endsWith(`/${name}`))
    const text = key === undefined ? undefined : w.files.get(key)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text as never }
  })
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    w.calls.push(argv)
    if (argv[2] === 'history') {
      if (w.historyFails) throw new Error('timeout')
      return { value: { exitCode: 0, stdout: JSON.stringify({ history: w.history, message: 'Successfully received submission history.' }), stderr: '' } as never }
    }
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

// ── Release scripts ──────────────────────────────────────────────────────────

const PROFILE = 'MyNotaryProfile'
const RELEASE = 'cd app && ./Scripts/release.sh 1.2.0'
const RELEASE_SH = ['#!/bin/bash', '# NOTARY_PROFILE defaults to SomeOldName (stale comment)', 'NOTARY_PROFILE="${NOTARY_PROFILE:-MyNotaryProfile}"', 'xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE"'].join('\n')
const HISTORY = ['xcrun', 'notarytool', 'history', '--keychain-profile', PROFILE, '--output-format', 'json']
const at = (ms: number) => new Date(ms).toISOString()
const sub = (id: string, createdMs: number, status = 'In Progress', name = 'App.dmg'): Sub => ({ createdDate: at(createdMs), id, name, status })
const historyCalls = (w: { calls: string[][] }) => w.calls.filter(c => c[2] === 'history')

test('a release script returns its result first, then history is asked once (test bites)', async ($, on) => {
  const w = world(on)
  w.files.set('app/Scripts/release.sh', RELEASE_SH)
  w.history = [sub(ID, 0)]
  w.bash = { stdout: 'release done' }
  const result = (await bash($, RELEASE)) as { result?: { stdout?: string } }
  // The tool result is back and nothing has been asked yet: the scan waits for after(0).
  expect(result.result?.stdout).toBe('release done')
  expect(w.calls).toEqual([])
  await w.clock.settle()
  expect(w.calls).toEqual([HISTORY])
  expect(w.statuses.at(-1)).toBe('notary: 2efe2717 In Progress')

  // Then it is polled like a direct submit, with the script's profile.
  await w.clock.advance(60_000)
  expect(w.calls.at(-1)).toEqual(['xcrun', 'notarytool', 'info', ID, '--keychain-profile', PROFILE, '--output-format', 'json'])
  w.info.set(ID, 'Accepted')
  await w.clock.advance(60_000)
  expect(w.toasts).toEqual(['notary ✓ accepted — now staple (2efe2717)'])
  expect(historyCalls(w).length).toBe(1)
  expect(w.toasts.join('\n')).not.toContain(PROFILE)
  expect(await listing($)).toContain('script · release.sh · 2 min · profile MyNotaryProfile (read from the script) · 1 new submission · history checked')
})

test('only submissions created since the script started (less 60s) are taken; a final one is only toasted', async ($, on) => {
  const w = world(on)
  await w.clock.set(10 * 60_000)
  const start = w.clock.now()
  w.files.set('app/Scripts/release.sh', RELEASE_SH)
  w.history = [sub(ID2, start - 61_000, 'Accepted', 'Old.dmg'), sub(ID, start - 30_000, 'Invalid')]
  w.bash = { stdout: '' }
  await bash($, RELEASE)
  await w.clock.settle()
  expect(w.toasts).toEqual([`notary ✗ invalid (2efe2717) — see why: xcrun notarytool log ${ID} <auth>`])
  expect(w.statuses.filter(s => s !== undefined)).toEqual([])
  await w.clock.advance(5 * 60_000)
  expect(w.calls).toEqual([HISTORY])
  const list = await listing($)
  expect(list).toContain(`${ID} · App.dmg · Invalid`)
  expect(list).not.toContain(ID2)
})

test('a submission is never followed twice: a direct submit in the same command, a second scan (test bites)', async ($, on) => {
  const w = world(on)
  w.files.set('release.sh', RELEASE_SH)
  w.history = [sub(ID, 0)]
  w.bash = { stdout: uploaded(ID) }
  await bash($, `rtk ./release.sh && ${SUBMIT}`)
  await w.clock.settle()
  expect(historyCalls(w).length).toBe(1)
  expect(w.toasts).toEqual([])
  await w.clock.advance(60_000)
  expect(w.calls.filter(c => c[2] === 'info').length).toBe(1)
  expect((await listing($)).split('\n').filter(line => line.startsWith(ID)).length).toBe(1)

  // A final one seen by two runs is toasted once.
  w.history = [sub(ID2, 60_000, 'Accepted')]
  await bash($, './release.sh')
  await w.clock.settle()
  await bash($, './release.sh')
  await w.clock.settle()
  expect(w.toasts).toEqual(['notary ✓ accepted — now staple (7c1d0e42)'])
})

test('the keychainProfile option is used as given; no profile anywhere means no history call, said in /notary-watch', { options: { keychainProfile: 'OtherProfile' } }, async ($, on) => {
  const w = world(on)
  w.bash = { stdout: '' }
  await bash($, './Scripts/release.sh')
  await w.clock.settle()
  expect(w.calls).toEqual([['xcrun', 'notarytool', 'history', '--keychain-profile', 'OtherProfile', '--output-format', 'json']])
  expect(await listing($)).toBe('script · release.sh · 0 min · profile OtherProfile · 0 new submissions · history checked')
})

test('a script with no readable profile is not checked, and /notary-watch says why', async ($, on) => {
  const w = world(on)
  w.files.set('Scripts/release.sh', 'xcrun notarytool submit "$1" --keychain-profile "$2"')
  w.bash = { stdout: '' }
  await bash($, './Scripts/release.sh')
  await bash($, './Scripts/missing-release.sh')
  await w.clock.settle()
  expect(w.calls).toEqual([])
  expect(await listing($)).toBe(
    [
      'script · release.sh · 0 min · not checked: keychain profile unknown (set the keychainProfile option)',
      'script · missing-release.sh · 0 min · not checked: keychain profile unknown (set the keychainProfile option)',
    ].join('\n'),
  )
})

test('scriptPattern selects the scripts; empty turns script support off', { options: { scriptPattern: '' } }, async ($, on) => {
  const w = world(on)
  w.files.set('Scripts/release.sh', RELEASE_SH)
  w.history = [sub(ID, 0)]
  await bash($, './Scripts/release.sh')
  await bash($, './Scripts/release.sh', 'agent-1')
  await w.clock.advance(5 * 60_000)
  expect(w.calls).toEqual([])
  expect(await listing($)).toBe('No notarization submission tracked this session.')
})

test('a backgrounded script is watched through history every 60s for 30 min', async ($, on) => {
  const w = world(on)
  w.files.set('Scripts/release.sh', RELEASE_SH)
  w.bash = { stdout: '' }
  await $.tool.call({ tool: 'Bash', command: './Scripts/release.sh 1.2.0', run_in_background: true } as never)
  await w.clock.settle()
  expect(w.calls).toEqual([])
  await w.clock.advance(60_000)
  expect(historyCalls(w).length).toBe(1)

  w.history = [sub(ID, 90_000)]
  await w.clock.advance(60_000)
  expect(w.statuses.at(-1)).toBe('notary: 2efe2717 In Progress')
  w.historyFails = true
  await w.clock.advance(60_000)
  expect(await listing($)).toContain('watching history (last check failed)')
  w.historyFails = false

  await w.clock.advance(30 * 60_000)
  expect(historyCalls(w).length).toBe(30)
  expect(await listing($)).toContain('script · release.sh · background · 33 min · profile MyNotaryProfile (read from the script) · 1 new submission · watched history for 30 min')
})

test('a script moved to the background (backgroundTaskId) is watched too; /notary-watch stop ends it', async ($, on) => {
  const w = world(on)
  w.files.set('Scripts/release.sh', RELEASE_SH)
  w.bash = { stdout: '', backgroundTaskId: 'task-1' }
  await bash($, './Scripts/release.sh')
  await w.clock.advance(2 * 60_000)
  expect(historyCalls(w).length).toBe(2)
  expect(await listing($, 'stop')).toBe('Stopped watching history for 1 script run.')
  await w.clock.advance(10 * 60_000)
  expect(historyCalls(w).length).toBe(2)
})
