import { expect, test } from 'claude-code/testing'

import { age, finalToast, newSubmissions, parseHistory, parseInfo, parseOutput, parseSubmit, scriptCall, scriptProfile, simpleCommands, statusLine } from './notary'

const ID = '2efe2717-52ef-43a5-96dc-0797e4ca1041'
const ISSUER = '69a6de7e-1111-47e3-e053-5b8c7c11a4d1'
const PATH_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

test('simpleCommands splits on operators, keeps quotes and drops redirections', () => {
  const words = simpleCommands(`cd "my dir" && FOO=1 rtk xcrun notarytool submit 'A b.zip' -p P 2>&1 | tee out.log; echo done > x`)
  expect(words.map(c => c.map(w => w.text))).toEqual([
    ['cd', 'my dir'],
    ['FOO=1', 'rtk', 'xcrun', 'notarytool', 'submit', 'A b.zip', '-p', 'P'],
    ['tee', 'out.log'],
    ['echo', 'done'],
  ])
  expect(simpleCommands('x --password "$PW" y')[0]!.map(w => w.expands)).toEqual([false, false, true, false])
  expect(simpleCommands("x --password '$PW'")[0]![2]!.expands).toBe(false)
})

test('parseSubmit finds the submit behind rtk, env, cd and xcrun options', () => {
  expect(parseSubmit('ls -la')).toBeNull()
  expect(parseSubmit('xcrun notarytool info abc -p P')).toBeNull()
  expect(parseSubmit('echo xcrun notarytool submit x.zip')).toBeNull()
  const sub = parseSubmit('cd release && env NOTARY=1 rtk /usr/bin/xcrun notarytool submit App.zip --keychain-profile MyNotaryProfile')
  expect(sub).toEqual({ auth: ['--keychain-profile', 'MyNotaryProfile'], canPoll: true, wait: false, json: false, file: 'App.zip' })
  expect(parseSubmit('notarytool submit a.dmg -p P --wait')?.wait).toBe(true)
  expect(parseSubmit('xcrun notarytool submit a.dmg -p P --wait --no-wait')?.wait).toBe(false)
})

test('parseSubmit reads short, long and = forms of auth and output format', () => {
  const key = parseSubmit(`xcrun notarytool submit a.zip -k ./AuthKey.p8 -d KEYID12345 -i ${ISSUER} -f json --timeout 10m`)
  expect(key).toEqual({ auth: ['--key', './AuthKey.p8', '--key-id', 'KEYID12345', '--issuer', ISSUER], canPoll: true, wait: false, json: true, file: 'a.zip' })
  const apple = parseSubmit('xcrun notarytool submit a.zip --apple-id dev@example.com --team-id=TEAMID1234 --password=fake-pass --output-format=json')
  expect(apple?.auth).toEqual(['--apple-id', 'dev@example.com', '--team-id', 'TEAMID1234', '--password', 'fake-pass'])
  expect(apple?.canPoll).toBe(true)
  expect(apple?.json).toBe(true)
  expect(parseSubmit('xcrun notarytool submit a.zip -p P --keychain /tmp/k.keychain-db')?.auth).toEqual(['--keychain-profile', 'P', '--keychain', '/tmp/k.keychain-db'])
})

test('auth that comes from the shell or a prompt cannot be polled', () => {
  expect(parseSubmit('xcrun notarytool submit a.zip --keychain-profile "$NOTARY_PROFILE"')?.canPoll).toBe(false)
  expect(parseSubmit('xcrun notarytool submit a.zip -p `cat profile`')?.canPoll).toBe(false)
  expect(parseSubmit('xcrun notarytool submit a.zip --apple-id dev@example.com --team-id TEAMID1234')?.canPoll).toBe(false)
  expect(parseSubmit('xcrun notarytool submit a.zip')?.canPoll).toBe(false)
})

test('parseOutput reads the JSON id and status, even among other lines', () => {
  expect(parseOutput(`{"message":"Successfully uploaded file","id":"${ID}","path":"/tmp/${PATH_UUID}/a.zip"}`)).toEqual({ id: ID, status: null })
  expect(parseOutput(`noise\n{"status":"Invalid","message":"Processing complete","id":"${ID}"}\n`)).toEqual({ id: ID, status: 'Invalid' })
})

test('parseOutput reads the UUID after the id: label, never another UUID (test bites)', () => {
  const normal = [
    `Conducting pre-submission checks for /tmp/${PATH_UUID}/App.zip and initiating connection to the Apple notary service...`,
    'Submission ID received',
    `  id: ${ID}`,
    'Upload progress: 100.00% (1.00 MB of 1.00 MB)',
    'Successfully uploaded file',
    `  id: ${ID}`,
    `  path: /tmp/${PATH_UUID}/App.zip`,
  ].join('\n')
  expect(parseOutput(normal)).toEqual({ id: ID, status: null })
  const waited = `${normal}\nWaiting for processing to complete.\nCurrent status: In Progress....\nCurrent status: Accepted....\nProcessing complete\n  id: ${ID}\n  status: Accepted\n`
  expect(parseOutput(waited)).toEqual({ id: ID, status: 'Accepted' })
  expect(parseOutput(`issuer ${ISSUER}`)).toEqual({ id: null, status: null })
})

test('parseInfo reads the status of notarytool info JSON', () => {
  expect(parseInfo(`{"createdDate":"2026-01-01T00:00:00.000Z","id":"${ID}","message":"Successfully received submission info","name":"a.zip","status":"In Progress"}`)).toBe('In Progress')
  expect(parseInfo('{"status":"Rejected"}')).toBe('Rejected')
  expect(parseInfo('Error: HTTP status code: 401')).toBeNull()
})

test('texts: toasts, status line, age', () => {
  expect(finalToast(ID, 'Accepted')).toBe('notary ✓ accepted — now staple (2efe2717)')
  expect(finalToast(ID, 'Invalid')).toBe(`notary ✗ invalid (2efe2717) — see why: xcrun notarytool log ${ID} <auth>`)
  expect(statusLine([])).toBeUndefined()
  expect(statusLine([{ id: ID }])).toBe('notary: 2efe2717 In Progress')
  expect(statusLine([{ id: ID }, { id: PATH_UUID }])).toBe('notary: 2 in progress')
  expect(age(5 * 60_000)).toBe('5 min')
  expect(age(125 * 60_000)).toBe('2h05')
})

test('scriptCall finds a release script in command position only (test bites)', () => {
  expect(scriptCall('./Scripts/release.sh 1.2.0', 'release')).toEqual({ path: './Scripts/release.sh', name: 'release.sh', env: {} })
  expect(scriptCall('cd app && NOTARY_PROFILE=Other rtk Scripts/release-full.sh 2.0', 'release')).toEqual({ path: 'app/Scripts/release-full.sh', name: 'release-full.sh', env: { NOTARY_PROFILE: 'Other' } })
  expect(scriptCall('bash -x /abs/Release.sh', 'release')?.path).toBe('/abs/Release.sh')
  expect(scriptCall('sh release.sh', 'release')?.path).toBe('release.sh')
  expect(scriptCall('release.sh', 'release')?.name).toBe('release.sh')
  expect(scriptCall('cd "$DIR" && ./release.sh', 'release')).toEqual({ path: null, name: 'release.sh', env: {} })
  // Not a script run: a directory, an argument, a reader, another tool, a plain word.
  expect(scriptCall('cd release && rtk xcrun notarytool submit release/App.zip -p P', 'release')).toBeNull()
  expect(scriptCall('echo Scripts/release.sh', 'release')).toBeNull()
  expect(scriptCall('cat Scripts/release.sh | head', 'release')).toBeNull()
  expect(scriptCall('gh release create v1.2.0', 'release')).toBeNull()
  expect(scriptCall('git commit -m "release 1.2"', 'release')).toBeNull()
  expect(scriptCall('./Scripts/build.sh', 'release')).toBeNull()
  // The pattern is configurable; empty turns it off.
  expect(scriptCall('./Scripts/build.sh', 'build')?.name).toBe('build.sh')
  expect(scriptCall('./Scripts/release.sh', '  ')).toBeNull()
})

test('scriptProfile reads the code, not the comments, and resolves shell defaults', () => {
  const script = [
    '#!/bin/bash',
    '# Usage: NOTARY_PROFILE=OldDocumentedProfile ./release.sh <version>',
    'NOTARY_PROFILE="${NOTARY_PROFILE:-MyNotaryProfile}"',
    'xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait',
  ].join('\n')
  expect(scriptProfile(script)).toBe('MyNotaryProfile')
  expect(scriptProfile(script, { NOTARY_PROFILE: 'Other' })).toBe('Other')
  expect(scriptProfile('xcrun notarytool submit a.zip --keychain-profile MyNotaryProfile')).toBe('MyNotaryProfile')
  expect(scriptProfile("xcrun notarytool submit a.zip --keychain-profile='My Profile'")).toBe('My Profile')
  expect(scriptProfile('PROFILE=MyNotaryProfile\nxcrun notarytool submit a --keychain-profile "${PROFILE}"')).toBe('MyNotaryProfile')
  expect(scriptProfile('xcrun notarytool submit a --keychain-profile "${P:-MyNotaryProfile}"')).toBe('MyNotaryProfile')
  // A default alone, with no --keychain-profile written out (passed through an array, say).
  expect(scriptProfile('export NOTARY_PROFILE="${NOTARY_PROFILE:-MyNotaryProfile}"\nARGS=(-p "$NOTARY_PROFILE")')).toBe('MyNotaryProfile')
  // Unknown: unresolvable, several different ones, none at all, `mkdir -p` never read as a profile.
  expect(scriptProfile('xcrun notarytool submit a --keychain-profile "$1"')).toBeNull()
  expect(scriptProfile('notarytool submit a --keychain-profile One\nnotarytool submit b --keychain-profile Two')).toBeNull()
  expect(scriptProfile('mkdir -p release\nxcrun notarytool submit a --apple-id x')).toBeNull()
  expect(scriptProfile('# --keychain-profile Commented\necho hi')).toBeNull()
})

const H1 = '11111111-2222-4333-8444-555555555555'
test('parseHistory reads notarytool history JSON; newSubmissions keeps those since the start, less 60s (test bites)', () => {
  const at = (ms: number) => new Date(ms).toISOString()
  const json = JSON.stringify({
    history: [
      { createdDate: at(1_000_000), id: ID, name: 'App.dmg', status: 'In Progress' },
      { createdDate: at(1_000_000 - 59_000), id: H1, name: 'App.zip', status: 'Accepted' },
      { createdDate: at(1_000_000 - 61_000), id: PATH_UUID, name: 'Old.zip', status: 'Invalid' },
      { createdDate: 'not a date', id: ISSUER, name: 'x', status: 'Accepted' },
      { createdDate: at(1_000_000), id: 'not-a-uuid', name: 'x', status: 'Accepted' },
    ],
    message: 'Successfully received submission history.',
  })
  const entries = parseHistory(json)
  expect(entries?.map(e => e.id)).toEqual([ID, H1, PATH_UUID])
  expect(newSubmissions(entries!, 1_000_000).map(e => [e.id, e.name, e.status])).toEqual([
    [H1, 'App.zip', 'Accepted'],
    [ID, 'App.dmg', 'In Progress'],
  ])
  // notarytool writes dates as yyyy-MM-dd'T'HH:mm:ss'Z', with or without .SSS: UTC either way.
  expect(parseHistory(JSON.stringify({ history: [{ createdDate: '2026-01-01T00:00:00Z', id: ID, name: 'a', status: 'Accepted' }] }))?.[0]?.createdMs).toBe(Date.UTC(2026, 0, 1))
  expect(parseHistory('{"message":"No submission history."}')).toEqual([])
  expect(parseHistory('Error: No Keychain password item found')).toBeNull()
})
