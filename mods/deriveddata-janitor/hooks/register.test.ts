import { expect, mock, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const HOME = '/Users/v'
const ROOT = `${HOME}/Library/Developer/Xcode/DerivedData`

const ran = (stdout: string, exitCode = 0): ProcessRunResult =>
  ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }) as ProcessRunResult

// `folders`: name -> WorkspacePath (null: no info.plist). `alive`: the workspace paths that still exist.
function world(on: On, folders: Map<string, string | null>, alive: Set<string>) {
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  const rm: string[][] = []
  const clock = mock.clock(on, { now: 0 })
  on('session.start', () => ({ cwd: '/p' }))
  on('env.get', () => ({ value: HOME }))
  on('fs.list', () => ({
    value: [
      ...[...folders.keys()].map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })),
      { name: 'stray.txt', kind: 'file', size: 1, mtimeMs: 0, isLink: false },
    ] as never,
  }))
  on('fs.exists', (_$, e) => ({
    value: alive.has(e.path) || [...folders.keys()].some(name => `${ROOT}/${name}` === e.path),
  }))
  on('process.run', (_$, e) => {
    const [cmd, ...rest] = e.argv
    if (cmd === 'plutil') {
      const name = rest[rest.length - 1]!.slice(ROOT.length + 1).split('/')[0]!
      const workspace = folders.get(name)
      return { value: workspace === null || workspace === undefined ? ran('', 1) : ran(`${workspace}\n`) }
    }
    if (cmd === 'du') return { value: ran(`1048576\t${rest[1]}\n`) }
    if (cmd === 'rm') {
      rm.push([...e.argv])
      folders.delete(rest[1]!.slice(ROOT.length + 1))
      return { value: ran('') }
    }
    throw new Error(`unexpected ${cmd}`)
  })
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined as never }))
  on('tool.call', () => ({ result: 'ok' as never }))
  return { statuses, toasts, rm, clock }
}

const start = async ($: Engine, clock: { settle: () => Promise<unknown> }) => {
  await $.session.start({ source: 'startup' } as never)
  await clock.settle()
}

const folders = () =>
  new Map<string, string | null>([
    ['Live-aaa', '/dev/Live.xcodeproj'],
    ['Dead-bbb', '/dev/.claude/worktrees/x/Dead.xcodeproj'],
    ['Dead-ccc', '/private/tmp/wt/Dead.xcodeproj'],
    ['Vol-ddd', '/Volumes/Ext/Vol.xcodeproj'],
    ['ModuleCache.noindex', null],
    ['NoPlist-eee', null],
  ])

test('session start scans in the background and shows the orphan count and size', async ($, on) => {
  const { statuses, rm, clock } = world(on, folders(), new Set(['/dev/Live.xcodeproj']))
  await start($, clock)

  expect(statuses).toEqual(['DerivedData: 2 orphans · 2.0 GB'])
  expect(rm).toEqual([])
})

test('no orphans leaves the status line empty', async ($, on) => {
  const { statuses, clock } = world(on, new Map([['Live-aaa', '/dev/Live.xcodeproj']]), new Set(['/dev/Live.xcodeproj']))
  await start($, clock)

  expect(statuses).toEqual([undefined])
})

test('/deriveddata-janitor lists orphans with their dead path and deletes nothing', async ($, on) => {
  const { rm, clock } = world(on, folders(), new Set(['/dev/Live.xcodeproj']))
  await start($, clock)
  const out = (await $.command.run({ command: 'deriveddata-janitor', args: 'status' } as never)) as { text: string }

  expect(out.text).toContain('Dead-bbb  <- /dev/.claude/worktrees/x/Dead.xcodeproj')
  expect(out.text).toContain('Dead-ccc  <- /private/tmp/wt/Dead.xcodeproj')
  expect(out.text).not.toContain('Live-aaa')
  expect(out.text).not.toContain('Vol-ddd')
  expect(out.text).not.toContain('NoPlist')
  expect(rm).toEqual([])
})

test('clean deletes exactly the orphans, by absolute path, and reports the freed size', async ($, on) => {
  const { rm, statuses, clock } = world(on, folders(), new Set(['/dev/Live.xcodeproj']))
  await start($, clock)
  const out = (await $.command.run({ command: 'deriveddata-janitor', args: 'clean' } as never)) as { text: string }

  expect(rm).toEqual([
    ['rm', '-rf', `${ROOT}/Dead-bbb`],
    ['rm', '-rf', `${ROOT}/Dead-ccc`],
  ])
  expect(out.text).toBe('Deleted 2 orphan folders, freed 2.0 GB.')
  expect(statuses.at(-1)).toBeUndefined()
})

test('an orphan whose workspace came back is not deleted', async ($, on) => {
  const alive = new Set(['/dev/Live.xcodeproj'])
  const { rm, clock } = world(on, folders(), alive)
  await start($, clock)
  alive.add('/private/tmp/wt/Dead.xcodeproj')
  await $.command.run({ command: 'deriveddata-janitor', args: 'clean' } as never)

  expect(rm).toEqual([['rm', '-rf', `${ROOT}/Dead-bbb`]])
})

test('nothing is ever deleted without the clean argument', async ($, on) => {
  const { rm, clock } = world(on, folders(), new Set())
  await start($, clock)
  await $.command.run({ command: 'deriveddata-janitor', args: '' } as never)
  await $.command.run({ command: 'deriveddata-janitor', args: 'nuke' } as never)
  await $.tool.call({ tool: 'Bash', command: 'git worktree remove ../wt' } as never)

  expect(rm).toEqual([])
})

test('git worktree remove rescans and toasts only new orphans', async ($, on) => {
  const map = new Map<string, string | null>([['Live-aaa', '/dev/Live.xcodeproj']])
  const alive = new Set(['/dev/Live.xcodeproj', '/dev/wt/Wt.xcodeproj'])
  map.set('Wt-fff', '/dev/wt/Wt.xcodeproj')
  const { toasts, clock } = world(on, map, alive)
  await start($, clock)
  expect(toasts).toEqual([])

  alive.delete('/dev/wt/Wt.xcodeproj')
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect(toasts).toEqual([])
  await $.tool.call({ tool: 'Bash', command: 'git worktree remove ../wt' } as never)
  expect(toasts).toEqual(['DerivedData: 1 new orphan (1.0 GB) — /deriveddata-janitor clean'])
  await $.tool.call({ tool: 'Bash', command: 'git worktree remove ../wt' } as never)
  expect(toasts).toHaveLength(1)
})
