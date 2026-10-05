import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

const MB = 1024 * 1024
const ROOT = '/dev/app'

const res = (exitCode: number, stdout = ''): ProcessRunResult => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

type World = {
  engine: 'allow' | 'ask' | 'deny'
  staged: string // numstat -z of the index
  unstaged: string // numstat -z of the working tree
  untracked: string[]
  sizes: Record<string, number> // working tree sizes, repo-relative
  blobs: Record<string, number> // staged blob sizes (cat-file)
  fail: string | null // a git subcommand that fails
  throws: boolean // process.run cannot start git
  calls: string[][]
  timeouts: number[]
  store?: Record<string, unknown>
  cutLsFiles?: boolean // ls-files output past the 4 MiB a run keeps
}

function world(on: On, w: Partial<World> = {}): World {
  const s: World = { engine: 'allow', staged: '', unstaged: '', untracked: [], sizes: {}, blobs: {}, fail: null, throws: false, calls: [], timeouts: [], ...w }
  mock.store(on, s.store)
  on('tool.check', () => ({ decision: s.engine }))
  on('session.cwd', () => ({ value: ROOT }))
  on('fs.stat', (_$, e) => {
    const size = s.sizes[e.path.slice(ROOT.length + 1)]
    if (size === undefined) throw new Error('ENOENT')
    return { value: { kind: 'file', size, mtimeMs: 0, isLink: false } as never }
  })
  on('ui.status', () => ({ value: undefined }))
  on('process.run', (_$, e) => {
    s.calls.push([...e.argv])
    s.timeouts.push(e.init?.timeoutMs ?? -1)
    if (s.throws) throw new Error('spawn failed')
    const [git, flagC, , sub, ...rest] = e.argv
    if (git !== 'git' || flagC !== '-C') return { value: res(1) }
    if (sub === s.fail) return { value: res(128) }
    if (sub === 'rev-parse') return { value: res(0, `${ROOT}\n`) }
    if (sub === 'diff') return { value: res(0, rest[0] === '--cached' ? s.staged : s.unstaged) }
    if (sub === 'ls-files') {
      const text = s.untracked.map(p => `${p}\0`).join('')
      return { value: s.cutLsFiles === true ? { ...res(0, `${text}web/node_mod`), isStdoutTruncated: true } : res(0, text) }
    }
    if (sub === 'cat-file') {
      const size = s.blobs[rest[1]!.slice(1)]
      return { value: size === undefined ? res(128) : res(0, `${size}\n`) }
    }
    return { value: res(1) }
  })

  return s
}

const check = ($: Engine, command: string) => $.tool.check({ tool: 'Bash', input: { command } } as never)
const run = async ($: Engine, args: string) => ((await $.command.run({ command: 'commit-size-guard', args } as never)) as { text: string }).text

test('a staged file over 5 MB asks, with its size and a .gitignore hint', async ($, on) => {
  world(on, { staged: '10\t0\tdata/huge.csv\x001\t0\tsrc/a.ts\0', sizes: { 'data/huge.csv': 12 * MB, 'src/a.ts': 300 } })

  const verdict = await check($, 'git commit -m "feat: data"')
  expect(verdict.decision).toBe('ask')
  expect(verdict.reason).toContain('- data/huge.csv: over 5 MB, 12 MB')
  expect(verdict.reason).not.toContain('src/a.ts')
  expect(verdict.reason).toContain('.gitignore')
})

test('a small, clean commit is left to the engine', async ($, on) => {
  const w = world(on, { staged: '1\t0\tsrc/a.ts\0', sizes: { 'src/a.ts': 300 } })

  expect((await check($, 'git commit -m "fix: a"')).decision).toBe('allow')
  w.engine = 'ask'
  expect((await check($, 'git commit -m "fix: a"')).reason).toBe(undefined)
})

test('build and release artifacts ask whatever their size', async ($, on) => {
  world(on, {
    staged: '1\t0\trelease/App-1.0.dmg\x001\t0\tbuild/App.app/Contents/Info.plist\x001\t0\tweb/node_modules/x/i.js\x001\t0\tweb/node_modules/y/i.js\0',
    sizes: { 'release/App-1.0.dmg': 30 * MB, 'build/App.app/Contents/Info.plist': 900 },
  })

  const reason = (await check($, 'rtk git commit -m "chore: ship"')).reason ?? ''
  expect(reason).toContain('- release/App-1.0.dmg: build artifact (*.dmg), over 5 MB, 30 MB')
  expect(reason).toContain('- build/App.app/: inside a .app bundle')
  expect(reason).toContain('- web/node_modules/ (2 files): inside node_modules/')
})

test('a binary over 1 MB asks; a small binary does not; a missing working file is sized from the index', async ($, on) => {
  const w = world(on, { staged: '-\t-\tassets/photo.png\0', sizes: { 'assets/photo.png': 2 * MB } })
  expect((await check($, 'git commit -m "feat: photo"')).reason).toContain('- assets/photo.png: binary over 1 MB, 2 MB')

  w.sizes = { 'assets/photo.png': MB / 2 }
  expect((await check($, 'git commit -m "feat: photo"')).decision).toBe('allow')

  w.sizes = {}
  w.blobs = { 'assets/photo.png': 3 * MB }
  expect((await check($, 'git commit -m "feat: photo"')).reason).toContain('- assets/photo.png: binary over 1 MB, 3 MB')
})

test('commit -a / -am / --all also looks at modified tracked files', async ($, on) => {
  const w = world(on, { staged: '', unstaged: '5\t1\tbig.json\0', sizes: { 'big.json': 9 * MB } })

  expect((await check($, 'git commit -m "x"')).decision).toBe('allow')
  expect((await check($, 'git commit -am "x"')).decision).toBe('ask')
  expect((await check($, 'git commit --all -m "x"')).decision).toBe('ask')
  expect((await check($, 'git commit -m "-a"')).decision).toBe('allow')
  expect(w.calls.filter(c => c[3] === 'diff').map(c => c.slice(3, 5).join(' '))).toEqual([
    'diff --cached',
    'diff --cached',
    'diff --numstat',
    'diff --cached',
    'diff --numstat',
    'diff --cached',
  ])
})

test('cd and -C set the folder git runs in', async ($, on) => {
  const w = world(on, { staged: '1\t0\tApp.zip\0', sizes: { 'App.zip': 10 } })

  expect((await check($, 'cd sub && git -C inner commit -m "x"')).decision).toBe('ask')
  expect(w.calls[0]!.slice(0, 3)).toEqual(['git', '-C', '/dev/app/sub/inner'])
})

test('git add asks for artifacts named on the line or found untracked under the pathspec', async ($, on) => {
  const w = world(on, { untracked: ['release/App.dmg', 'src/new.ts'], sizes: { 'release/App.dmg': 4 * MB, 'src/new.ts': 10 } })

  const reason = (await check($, 'git add .')).reason ?? ''
  expect(reason).toContain('this git add stages')
  expect(reason).toContain('- release/App.dmg: build artifact (*.dmg), 4 MB')
  expect(reason).not.toContain('src/new.ts')
  expect(w.calls.find(c => c[3] === 'ls-files')!.slice(-2)).toEqual(['--', '.'])

  w.untracked = []
  expect((await check($, 'git add -f build/Out.ipa')).reason).toContain('- build/Out.ipa: build artifact (*.ipa)')
  expect((await check($, 'git add src/new.ts')).decision).toBe('allow')
  expect((await check($, 'git add -n release/App.dmg')).decision).toBe('allow')
})

test('git add -A with no path looks at the whole repository', async ($, on) => {
  const w = world(on, { untracked: ['DerivedData/x.o'] })

  expect((await check($, 'git add -A')).reason).toContain('- DerivedData/: inside DerivedData/')
  expect(w.calls.find(c => c[3] === 'ls-files')!.slice(-2)).toEqual(['--', ':/'])
})

test('a git failure or timeout lets the engine decide', async ($, on) => {
  const w = world(on, { staged: '1\t0\tApp.zip\0', sizes: { 'App.zip': 10 }, fail: 'diff' })
  expect((await check($, 'git commit -m "x"')).decision).toBe('allow')

  w.fail = null
  w.throws = true
  expect((await check($, 'git commit -m "x"')).decision).toBe('allow')
})

test('git calls carry a 5 second timeout', async ($, on) => {
  const w = world(on, { staged: '-\t-\tApp.bin\0', blobs: { 'App.bin': 10 } })
  await check($, 'git commit -am "x"')
  expect(w.timeouts).toEqual([5000, 5000, 5000, 5000])
})

test('an engine deny is never weakened; other commands are not looked at', async ($, on) => {
  const w = world(on, { engine: 'deny', staged: '1\t0\tApp.zip\0' })

  expect((await check($, 'git commit -m "x"')).decision).toBe('deny')
  w.engine = 'allow'
  expect((await check($, 'git status')).decision).toBe('allow')
  expect((await check($, 'ls -la')).decision).toBe('allow')
  expect(w.calls).toEqual([])
})

test('maxMB option changes the size limit', { options: { maxMB: 20 } }, async ($, on) => {
  const w = world(on, { staged: '1\t0\tdata.csv\0', sizes: { 'data.csv': 12 * MB } })

  expect((await check($, 'git commit -m "x"')).decision).toBe('allow')
  w.sizes = { 'data.csv': 25 * MB }
  expect((await check($, 'git commit -m "x"')).reason).toContain('over 20 MB')
})

test('/commit-size-guard off stops asking (kept in the store), on resumes', async ($, on) => {
  world(on, { staged: '1\t0\tApp.zip\0', sizes: { 'App.zip': 10 } })

  expect(await run($, 'off')).toContain('OFF')
  expect((await check($, 'git commit -m "x"')).decision).toBe('allow')
  expect(await run($, 'status')).toContain('OFF')
  expect(await run($, 'on')).toContain('is ON')
  expect((await check($, 'git commit -m "x"')).decision).toBe('ask')
})

test('the off switch is read from the store, so it holds across sessions', async ($, on) => {
  world(on, { staged: '1\t0\tApp.zip\0', sizes: { 'App.zip': 10 }, store: { off: true } })

  expect((await check($, 'git commit -m "x"')).decision).toBe('allow')
  expect(await run($, 'status')).toContain('OFF (kept across sessions)')
})

test('a listing cut off past 4 MiB is still checked up to its last whole entry, and says so', async ($, on) => {
  world(on, { untracked: ['web/node_modules/a/i.js', 'web/node_modules/b/i.js'], cutLsFiles: true })

  const verdict = await check($, 'git add .')
  expect(verdict.decision).toBe('ask')
  expect(verdict.reason).toContain('- web/node_modules/ (2 files): inside node_modules/')
  expect(verdict.reason).toContain('- file list: over 4 MiB of paths, only its start was checked')
  expect(verdict.reason).not.toContain('web/node_mod\n')
})
