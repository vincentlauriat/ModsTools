import { expect, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

const HOME = '/Users/v'
const ROOT = `${HOME}/Library/Developer/Xcode/DerivedData`
const PANE = {
  plugin: 'worktree-pane',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'worktree-pane',
  props: { title: 'Worktrees', isFocused: false, bodyColumns: 80, placement: 'dock' } as never,
} as const

const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false }) as ProcessRunResult

// Worktrees: main /dev/app, clean /dev/app-wt1 (2 DerivedData) and /dev/app-wt10 (1), dirty /dev/app-dirty (1).
function world(on: On, opts: { repo?: boolean } = {}) {
  const trees = new Map<string, { branch: string | null; dirty: number }>([
    ['/dev/app', { branch: 'main', dirty: 0 }],
    ['/dev/app-wt1', { branch: 'feat/one', dirty: 0 }],
    ['/dev/app-wt10', { branch: null, dirty: 0 }],
    ['/dev/app-dirty', { branch: 'dirty', dirty: 3 }],
  ])
  const folders = new Map<string, string>([
    ['App-aaa', '/dev/app/App.xcodeproj'],
    ['Wt1-bbb', '/dev/app-wt1/App.xcodeproj'],
    ['Wt1-ccc', '/dev/app-wt1/Sub/App.xcworkspace'],
    ['Wt10-ddd', '/dev/app-wt10/App.xcodeproj'],
    ['Dirty-eee', '/dev/app-dirty/App.xcodeproj'],
    ['ModuleCache.noindex', ''],
  ])
  const calls: string[][] = []
  const toasts: string[] = []
  on('session.cwd', () => ({ value: '/dev/app' }))
  on('env.get', () => ({ value: HOME }))
  on('fs.list', () => ({
    value: [...folders.keys()].map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })) as never,
  }))
  on('fs.exists', (_$, e) => ({
    value: trees.has(e.path) || [...folders.keys()].some(name => `${ROOT}/${name}` === e.path),
  }))
  on('process.run', (_$, e) => {
    calls.push([...e.argv])
    const [cmd, a, b, c] = e.argv
    if (cmd === 'git' && a === 'worktree' && b === 'list') {
      if (opts.repo === false) return { value: ran('', 128, 'fatal: not a git repository') }
      const text = [...trees].map(([path, t]) => `worktree ${path}\nHEAD abc\n${t.branch === null ? 'detached' : `branch refs/heads/${t.branch}`}\n`)

      return { value: ran(`${text.join('\n')}\n`) }
    }
    if (cmd === 'git' && a === '-C') return { value: ran(' M f\n'.repeat(trees.get(b!)?.dirty ?? 0)) }
    if (cmd === 'git' && a === 'worktree' && b === 'remove') {
      if ((trees.get(c!)?.dirty ?? 0) > 0) return { value: ran('', 128, `fatal: '${c}' contains modified or untracked files, use --force to delete it\n`) }
      trees.delete(c!)
      return { value: ran('') }
    }
    if (cmd === 'plutil') {
      const name = e.argv[e.argv.length - 1]!.slice(ROOT.length + 1).split('/')[0]!
      const workspace = folders.get(name)
      return { value: workspace ? ran(`${workspace}\n`) : ran('', 1) }
    }
    if (cmd === 'du') return { value: ran(`1048576\t${a === '-sk' ? b : ''}\n`) }
    if (cmd === 'rm') {
      folders.delete(b!.slice(ROOT.length + 1))
      return { value: ran('') }
    }
    throw new Error(`unexpected ${e.argv.join(' ')}`)
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { calls, toasts, trees, folders }
}

const opened = ($: { command: { run: (c: never) => Promise<unknown> } }, args = '') => $.command.run({ command: 'worktrees', args } as never)
const mutations = (calls: string[][]) => calls.filter(c => c[0] === 'rm' || (c[0] === 'git' && c[2] === 'remove')).map(c => c.join(' '))

test('the pane lists worktrees with branch, main marker, dirty count and DerivedData', async ($, on) => {
  world(on)
  const out = (await opened($)) as { text: string }
  expect(out.text).toBe('Worktrees pane opened (4 worktrees).')

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: '4 worktrees' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'app · main · main' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '/dev/app-wt1 · feat/one' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '/dev/app-wt10 · detached' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '/dev/app-dirty · dirty · 3 dirty' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '  DerivedData: 2 folders · 2.0 GB' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '  DerivedData: 1 folder · 1.0 GB' })).toBeDefined()
  await ui.unmount()
})

test('the main worktree has no Remove button; the others do', async ($, on) => {
  world(on)
  await opened($)

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Button', key: 'remove:/dev/app' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'remove:/dev/app-wt1', text: 'Remove' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'remove:/dev/app-dirty', text: 'Remove' })).toBeDefined()
  await ui.unmount()
})

test('two-step remove: first press only arms, second runs git then deletes exactly its DerivedData', async ($, on) => {
  const { calls, toasts, folders } = world(on)
  await opened($)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'remove:/dev/app-wt1' })
  expect(mutations(calls)).toEqual([])
  expect(await ui.find({ type: 'Button', key: 'remove:/dev/app-wt1', text: 'Confirm remove?' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'remove:/dev/app-wt10', text: 'Remove' })).toBeDefined()

  await ui.press({ key: 'remove:/dev/app-wt1' })
  expect(mutations(calls)).toEqual([
    'git worktree remove /dev/app-wt1',
    `rm -rf ${ROOT}/Wt1-bbb`,
    `rm -rf ${ROOT}/Wt1-ccc`,
  ])
  expect(toasts).toEqual(['Removed app-wt1 + 2 DerivedData (2.0 GB)'])
  expect([...folders.keys()]).toEqual(['App-aaa', 'Wt10-ddd', 'Dirty-eee', 'ModuleCache.noindex'])
  expect(await ui.find({ type: 'Button', key: 'remove:/dev/app-wt1' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '3 worktrees' })).toBeDefined()
  await ui.unmount()
})

test('a dirty worktree fails in git: error shown, nothing deleted', async ($, on) => {
  const { calls, toasts, folders } = world(on)
  await opened($)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'remove:/dev/app-dirty' })
  await ui.press({ key: 'remove:/dev/app-dirty' })
  expect(mutations(calls)).toEqual(['git worktree remove /dev/app-dirty'])
  expect(folders.has('Dirty-eee')).toBe(true)
  expect(toasts).toEqual([])
  expect(await ui.find({ type: 'Text', text: /^git: fatal: '\/dev\/app-dirty' contains modified/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'remove:/dev/app-dirty', text: 'Remove' })).toBeDefined()
  await ui.unmount()
})

test('a refresh or another press resets the pending confirm', async ($, on) => {
  const { calls } = world(on)
  await opened($)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'remove:/dev/app-wt1' })
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Button', key: 'remove:/dev/app-wt1', text: 'Remove' })).toBeDefined()

  await ui.press({ key: 'remove:/dev/app-wt1' })
  await ui.press({ key: 'remove:/dev/app-wt10' })
  expect(await ui.find({ type: 'Button', key: 'remove:/dev/app-wt1', text: 'Remove' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'remove:/dev/app-wt10', text: 'Confirm remove?' })).toBeDefined()
  expect(mutations(calls)).toEqual([])
  await ui.unmount()
})

test('outside a git repository the pane says so', async ($, on) => {
  world(on, { repo: false })
  const out = (await opened($)) as { text: string }
  expect(out.text).toBe('not a git repository')

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'not a git repository' })).toBeDefined()
  await ui.unmount()
})

test('close closes the pane', async ($, on) => {
  world(on)
  const out = (await opened($, 'close')) as { text: string }
  expect(out.text).toBe('Worktrees pane closed.')
})
