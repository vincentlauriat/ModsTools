import { expect, test } from 'claude-code/testing'

import { ancestors, bandText, generatedFolders, resolve, runToast, swiftTargets } from './sync'

test('resolve folds relative paths, dots and home', () => {
  expect(resolve('/dev/app', 'Sources/../A.swift')).toBe('/dev/app/A.swift')
  expect(resolve('/dev/app', '/abs/./B.swift')).toBe('/abs/B.swift')
  expect(resolve('/dev/app', '~/x/C.swift', '/home/u')).toBe('/home/u/x/C.swift')
  expect(resolve('/dev/app', '~/x/C.swift')).toBeNull()
})

test('ancestors climb to the root, closest first', () => {
  expect(ancestors('/dev/app/Sources')).toEqual(['/dev/app/Sources', '/dev/app', '/dev', '/'])
  expect(ancestors('/')).toEqual(['/'])
})

test('rm, git rm, mv and git mv of Swift files are seen, wrappers and cd followed', () => {
  expect(swiftTargets('rm Sources/A.swift', '/dev/app')).toEqual(['/dev/app/Sources/A.swift'])
  expect(swiftTargets('rtk git rm -q "Sources/A.swift"', '/dev/app')).toEqual(['/dev/app/Sources/A.swift'])
  expect(swiftTargets('cd /dev/other && mv Old.swift New.swift', '/dev/app')).toEqual(['/dev/other/Old.swift', '/dev/other/New.swift'])
  expect(swiftTargets('git -C /dev/lib mv A.swift B.swift', '/dev/app')).toEqual(['/dev/lib/A.swift', '/dev/lib/B.swift'])
  expect(swiftTargets('rm -f Sources/*.swift', '/dev/app')).toEqual(['/dev/app/Sources/*.swift'])
})

test('other commands and non-Swift files are ignored', () => {
  expect(swiftTargets('rm notes.md && mv a.txt b.txt', '/dev/app')).toEqual([])
  expect(swiftTargets('cat A.swift', '/dev/app')).toEqual([])
  expect(swiftTargets('git status', '/dev/app')).toEqual([])
})

test('xcodegen generate is recognised with rtk, cd and --spec', () => {
  expect(generatedFolders('xcodegen generate', '/dev/app')).toEqual(['/dev/app'])
  expect(generatedFolders('rtk xcodegen generate', '/dev/app')).toEqual(['/dev/app'])
  expect(generatedFolders('cd /dev/other && xcodegen generate --quiet', '/dev/app')).toEqual(['/dev/other'])
  expect(generatedFolders('xcodegen', '/dev/app')).toEqual(['/dev/app'])
  expect(generatedFolders('xcodegen generate --spec ../lib/project.yml', '/dev/app')).toEqual(['/dev/lib'])
  expect(generatedFolders('xcodegen dump', '/dev/app')).toEqual([])
  expect(generatedFolders('echo xcodegen generate', '/dev/app')).toEqual([])
})

test('band text and run toasts', () => {
  expect(bandText('/home/u/dev/app', '/home/u')).toBe('XcodeGen: project.yml or Swift files changed in ~/dev/app — run xcodegen generate')
  expect(runToast('/dev/app', null, 0, '', 'anything')).toBe('xcodegen: generated /dev/app')
  expect(runToast('/dev/app', null, 1, '\n  Spec validation error  \nmore', '')).toBe('xcodegen failed in /dev/app: Spec validation error')
  expect(runToast('/dev/app', null, 1, '', 'only stdout')).toBe('xcodegen failed in /dev/app: only stdout')
})
