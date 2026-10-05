import { expect, test } from 'claude-code/testing'

import { applyEdit, checkCommand, checkKeyChange, publicKeys } from './rules'

const decision = (command: string) => checkCommand(command)?.decision ?? 'pass'

test('deleting the Sparkle keychain item is denied, by service, label or default account', () => {
  expect(decision('security delete-generic-password -s https://sparkle-project.org')).toBe('deny')
  expect(decision('security delete-generic-password -l "Private key for signing Sparkle updates"')).toBe('deny')
  expect(decision("rtk security delete-internet-password -s 'https://sparkle-project.org' -a ed25519")).toBe('deny')
  expect(decision('cd /dev/app && security delete-generic-password -a ed25519')).toBe('deny')
  expect(decision('/usr/bin/security delete-generic-password -s https://sparkle-project.org')).toBe('deny')
})

test('other keychain commands pass', () => {
  expect(decision('security delete-generic-password -s other-service')).toBe('pass')
  expect(decision('security find-generic-password -s https://sparkle-project.org')).toBe('pass')
})

test('generate_keys without -p or -x asks, wherever the binary lives', () => {
  expect(decision('generate_keys')).toBe('ask')
  expect(decision('./bin/generate_keys')).toBe('ask')
  expect(decision('rtk /dev/app/Sparkle/bin/generate_keys --account work')).toBe('ask')
  expect(decision('SPARKLE=1 env generate_keys; echo done')).toBe('ask')
  expect(checkCommand('generate_keys')?.reason).toContain('generate_keys -p')
})

test('generate_keys -p, -x and their long forms pass', () => {
  expect(decision('./bin/generate_keys -p')).toBe('pass')
  expect(decision('generate_keys --lookUpPublicKey --account work')).toBe('pass')
  expect(decision('generate_keys -p --account=work')).toBe('pass')
  expect(decision('generate_keys -x /dev/key.txt')).toBe('pass')
  expect(decision('generate_keys --exportedPrivateKeyFile=/dev/key.txt')).toBe('pass')
  expect(decision('echo generate_keys')).toBe('pass')
})

test('generate_keys -f asks, even beside -p', () => {
  expect(decision('generate_keys -f /dev/key.txt')).toBe('ask')
  expect(decision('generate_keys --importedPrivateKeyFile=/dev/key.txt')).toBe('ask')
  expect(decision('generate_keys -p && generate_keys -f /dev/key.txt')).toBe('ask')
  expect(decision('generate_keys -p -f /dev/key.txt')).toBe('ask')
  expect(checkCommand('generate_keys -f k')?.reason).toContain('imports')
})

test('a delete in the same line wins over an ask', () => {
  expect(decision('generate_keys; security delete-generic-password -s https://sparkle-project.org')).toBe('deny')
})

test('public keys are read from plist, YAML, build settings and JSON', () => {
  expect(publicKeys('<key>SUPublicEDKey</key>\n\t<string>AAA=</string>')).toEqual(['AAA='])
  expect(publicKeys('    SUPublicEDKey: "BBB="\n')).toEqual(['BBB='])
  expect(publicKeys('INFOPLIST_KEY_SUPublicEDKey = CCC=')).toEqual(['CCC='])
  expect(publicKeys('{ "SUPublicEDKey": "DDD=" }')).toEqual(['DDD='])
  expect(publicKeys('<key>SUPublicEDKey</key><string>$(SPARKLE_KEY)</string>')).toEqual(['$(SPARKLE_KEY)'])
  expect(publicKeys('nothing here')).toEqual([])
})

test('changing or removing an existing key asks; adding one or other edits pass', () => {
  const plist = '<key>SUFeedURL</key><string>u</string>\n<key>SUPublicEDKey</key>\n<string>OLDKEY=</string>'
  expect(checkKeyChange('/dev/app/Info.plist', plist, plist.replace('OLDKEY=', 'NEWKEY='))?.decision).toBe('ask')
  expect(checkKeyChange('/dev/app/Info.plist', plist, plist.replace('OLDKEY=', 'NEWKEY='))?.reason).toContain('from OLDKEY= to NEWKEY= in Info.plist')
  expect(checkKeyChange('/dev/app/Info.plist', plist, '<key>SUFeedURL</key>')?.reason).toContain('removes SUPublicEDKey')
  expect(checkKeyChange('/dev/app/Info.plist', plist, plist.replace('<string>u<', '<string>v<'))).toBeNull()
  expect(checkKeyChange('/dev/app/project.yml', 'name: App\n', 'name: App\nSUPublicEDKey: NEW=\n')).toBeNull()
  expect(checkKeyChange('/dev/app/project.yml', null, 'SUPublicEDKey: NEW=\n')).toBeNull()
})

test('applyEdit replaces the first occurrence, or all with replace_all', () => {
  expect(applyEdit('a b a', { old_string: 'a', new_string: 'c' })).toBe('c b a')
  expect(applyEdit('a b a', { old_string: 'a', new_string: '$&', replace_all: true })).toBe('$& b $&')
  expect(applyEdit('a b', { old_string: 'z', new_string: 'c' })).toBe('a b')
})
