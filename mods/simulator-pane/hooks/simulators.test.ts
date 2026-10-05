import { expect, test } from 'claude-code/testing'

import { countLabel, parseBooted, rowLabel, runtimeName, shutdownToast, statusText } from './simulators'

const UDID_A = '11111111-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
const UDID_B = '22222222-BBBB-4BBB-8BBB-BBBBBBBBBBBB'

test('runtime identifiers become pretty names, xrOS is visionOS', () => {
  expect(runtimeName('com.apple.CoreSimulator.SimRuntime.iOS-27-0')).toBe('iOS 27.0')
  expect(runtimeName('com.apple.CoreSimulator.SimRuntime.watchOS-11-2')).toBe('watchOS 11.2')
  expect(runtimeName('com.apple.CoreSimulator.SimRuntime.tvOS-18-4-1')).toBe('tvOS 18.4.1')
  expect(runtimeName('com.apple.CoreSimulator.SimRuntime.xrOS-2-0')).toBe('visionOS 2.0')
  expect(runtimeName('com.apple.CoreSimulator.SimRuntime.Unknown')).toBe('Unknown')
})

test('parseBooted keeps only Booted devices, sorted by runtime then name', () => {
  const json = JSON.stringify({
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [
        { udid: UDID_B, name: 'iPhone 17', state: 'Booted', isAvailable: true },
        { udid: 'x', name: 'iPhone 16', state: 'Shutdown', isAvailable: true },
      ],
      'com.apple.CoreSimulator.SimRuntime.watchOS-27-0': [],
      'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [{ udid: UDID_A, name: 'iPad Air', state: 'Booted' }],
    },
  })
  expect(parseBooted(json)).toEqual([
    { udid: UDID_A, name: 'iPad Air', runtime: 'iOS 26.0' },
    { udid: UDID_B, name: 'iPhone 17', runtime: 'iOS 27.0' },
  ])
})

test('parseBooted: empty is a list, garbage is null', () => {
  expect(parseBooted('{ "devices" : { "com.apple.CoreSimulator.SimRuntime.iOS-27-0" : [ ] } }')).toEqual([])
  expect(parseBooted('xcrun: error: unable to find utility "simctl"')).toBeNull()
  expect(parseBooted('{"other": 1}')).toBeNull()
  expect(parseBooted('null')).toBeNull()
})

test('labels, status text and toasts', () => {
  expect(rowLabel({ udid: UDID_A, name: 'iPad Air', runtime: 'iOS 26.0' })).toBe('iPad Air · iOS 26.0 · 11111111')
  expect(countLabel(0)).toBe('No booted simulators')
  expect(countLabel(1)).toBe('1 booted simulator')
  expect(countLabel(3)).toBe('3 booted simulators')
  expect(statusText(2)).toBe('📱 2 booted')
  expect(statusText(0)).toBeUndefined()
  expect(statusText(null)).toBeUndefined()
  expect(shutdownToast('iPhone 17', 0, '')).toBe('Shut down iPhone 17')
  expect(shutdownToast(null, 0, '')).toBe('Shut down all simulators')
  expect(shutdownToast('iPhone 17', 149, '\nAn error was encountered\n  more\n')).toBe('simctl shutdown failed: An error was encountered')
  expect(shutdownToast(null, 1, '')).toBe('simctl shutdown failed (exit 1)')
})
