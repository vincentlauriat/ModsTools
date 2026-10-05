import { expect, test } from 'claude-code/testing'

import { MB, TRUNCATED, addArgs, artifactOf, askReason, commitArgs, gitRuns, offenders, parseNulList, parseNumstat, parseSize, relativeTo, resolvePath, wholeEntries, withTruncation } from './rules'

test('gitRuns finds git commit/add through rtk, env, assignments, cd and -C', () => {
  expect(gitRuns('git commit -m "feat: x"')).toEqual([{ sub: 'commit', args: ['-m', 'feat: x'], dir: undefined }])
  expect(gitRuns('rtk git commit -am "a; b"')).toEqual([{ sub: 'commit', args: ['-am', 'a; b'], dir: undefined }])
  expect(gitRuns('GIT_AUTHOR_NAME=x env -u FOO git -c user.name=y commit')).toEqual([{ sub: 'commit', args: [], dir: undefined }])
  expect(gitRuns('cd sub && git -C inner add . && git status')).toEqual([
    { sub: 'add', args: ['.'], dir: 'sub/inner' },
    { sub: 'status', args: [], dir: 'sub' },
  ])
  expect(gitRuns('cd /dev/other; git -C /dev/app commit')).toEqual([{ sub: 'commit', args: [], dir: '/dev/app' }])
  expect(gitRuns('echo git commit')).toEqual([])
  expect(gitRuns('legit commit')).toEqual([])
})

test('commitArgs sees -a alone, in clusters and as --all, and not inside a message', () => {
  expect(commitArgs(['-a', '-m', 'x']).all).toBe(true)
  expect(commitArgs(['-am', 'x']).all).toBe(true)
  expect(commitArgs(['-vam', 'x']).all).toBe(true)
  expect(commitArgs(['--all']).all).toBe(true)
  expect(commitArgs(['-m', '-a']).all).toBe(false)
  expect(commitArgs(['-ma']).all).toBe(false)
  expect(commitArgs(['--message', '-a']).all).toBe(false)
  expect(commitArgs(['-m', 'x']).all).toBe(false)
  expect(commitArgs(['--dry-run']).dryRun).toBe(true)
  expect(commitArgs(['-m', 'x', '--', 'a.ts']).paths).toEqual(['a.ts'])
})

test('addArgs reads paths and -A/-u/-n', () => {
  expect(addArgs(['.'])).toEqual({ all: false, update: false, dryRun: false, paths: ['.'] })
  expect(addArgs(['-A'])).toEqual({ all: true, update: false, dryRun: false, paths: [] })
  expect(addArgs(['-u', '--', '-weird'])).toEqual({ all: false, update: true, dryRun: false, paths: ['-weird'] })
  expect(addArgs(['-n', 'x']).dryRun).toBe(true)
})

test('parseNumstat reads -z output: plain, binary and rename forms', () => {
  const text = '2\t0\tb.txt\0-\t-\tbig.bin\x001\t0\t\0old name.txt\0new name.txt\0'
  expect(parseNumstat(text)).toEqual([
    { path: 'b.txt', binary: false },
    { path: 'big.bin', binary: true },
    { path: 'new name.txt', binary: false },
  ])
  expect(parseNumstat('')).toEqual([])
  expect(parseNulList('a\0b c\0')).toEqual(['a', 'b c'])
  expect(parseSize('2000000\n')).toBe(2000000)
  expect(parseSize('')).toBe(null)
})

test('artifactOf matches build and release artifacts only', () => {
  expect(artifactOf('release/App-1.0.dmg')?.reason).toBe('build artifact (*.dmg)')
  expect(artifactOf('dist/App.ZIP')?.reason).toBe('build artifact (*.zip)')
  expect(artifactOf('out/App.ipa')?.reason).toBe('build artifact (*.ipa)')
  expect(artifactOf('build/App.app/Contents/MacOS/App')).toEqual({ reason: 'inside a .app bundle', group: 'build/App.app/' })
  expect(artifactOf('App.xcarchive/Info.plist')?.group).toBe('App.xcarchive/')
  expect(artifactOf('web/node_modules/x/index.js')).toEqual({ reason: 'inside node_modules/', group: 'web/node_modules/' })
  expect(artifactOf('DerivedData/Build/x.o')?.reason).toBe('inside DerivedData/')
  expect(artifactOf('.build/debug/tool')?.reason).toBe('inside .build/')
  expect(artifactOf('release/App.pkg')?.reason).toBe('release artifact (release/)')
  expect(artifactOf('release/release-notes-1.0.md')).toBe(null)
  expect(artifactOf('src/release/notes.ts')).toBe(null)
  expect(artifactOf('src/main.ts')).toBe(null)
  expect(artifactOf('docs/app.md')).toBe(null)
  expect(artifactOf('src/handlers.app')).toBe(null)
})

test('offenders: size over the limit, binaries over 1 MB, artifacts grouped by folder', () => {
  const found = offenders(
    [
      { path: 'small.txt', size: 100, binary: false },
      { path: 'huge.csv', size: 6 * MB, binary: false },
      { path: 'img.png', size: 2 * MB, binary: true },
      { path: 'icon.png', size: MB / 2, binary: true },
      { path: 'node_modules/a.js', size: 10, binary: false },
      { path: 'node_modules/b.js', size: 20, binary: false },
      { path: 'App.dmg', size: null, binary: true },
    ],
    5 * MB,
  )
  expect(found).toEqual([
    { path: 'huge.csv', size: 6 * MB, reasons: ['over 5 MB'], files: 1 },
    { path: 'img.png', size: 2 * MB, reasons: ['binary over 1 MB'], files: 1 },
    { path: 'node_modules/', size: 30, reasons: ['inside node_modules/'], files: 2 },
    { path: 'App.dmg', size: null, reasons: ['build artifact (*.dmg)'], files: 1 },
  ])
})

test('askReason lists up to 5 offenders with sizes and suggests .gitignore', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ path: `f${i}.zip`, size: 2 * MB, reasons: ['build artifact (*.zip)'], files: 1 }))
  const text = askReason(many, 'commit')
  expect(text).toContain('- f0.zip: build artifact (*.zip), 2 MB')
  expect(text).toContain('- f4.zip')
  expect(text).not.toContain('- f5.zip')
  expect(text).toContain('- and 2 more')
  expect(text).toContain('.gitignore')
  expect(text).toContain('git restore --staged')
  expect(askReason([{ path: 'node_modules/', size: null, reasons: ['inside node_modules/'], files: 3 }], 'add')).toContain('- node_modules/ (3 files): inside node_modules/\n')
})

test('paths: resolve and relative to the repository root', () => {
  expect(resolvePath('../b/./c', '/dev/app/sub')).toBe('/dev/app/b/c')
  expect(relativeTo('/dev/app/x/y', '/dev/app')).toBe('x/y')
  expect(relativeTo('/dev/application/y', '/dev/app')).toBe(null)
})

test('wholeEntries drops a cut-off last entry; withTruncation adds a note', () => {
  expect(wholeEntries('a\0b\0c')).toBe('a\0b\0')
  expect(wholeEntries('partial')).toBe('')
  expect(withTruncation([], true)).toEqual([TRUNCATED])
  expect(withTruncation([], false)).toEqual([])
})
