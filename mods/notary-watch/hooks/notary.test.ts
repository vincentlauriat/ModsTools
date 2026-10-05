import { expect, test } from 'claude-code/testing'

import { age, finalToast, parseInfo, parseOutput, parseSubmit, simpleCommands, statusLine } from './notary'

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
