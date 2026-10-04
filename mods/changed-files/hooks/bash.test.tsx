import { expect, test } from 'claude-code/testing'
import type { ProcessRunResult } from 'claude-code'

const PANE = {
  component: 'Pane',
  requestId: 'changed-files',
  props: { title: 'Changed files', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
} as const

const ok = (stdout: string): ProcessRunResult => ({
  exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
})

// A fake git repo at /proj: `dirty` maps repo paths to content hashes, `deleted` lists removed paths.
function fakeGit() {
  const repo = { dirty: new Map<string, string>([['old.ts', 'h0']]), deleted: [] as string[] }
  const answer = (argv: readonly string[]): ProcessRunResult => {
    const args = argv.slice(1).join(' ')
    if (args === 'rev-parse --show-toplevel') return ok('/proj\n')
    if (args === 'ls-files -z -d') return ok(repo.deleted.map(p => p + '\0').join(''))
    if (args.startsWith('ls-files')) return ok([...repo.dirty.keys(), ...repo.deleted].map(p => p + '\0').join(''))
    if (args.startsWith('hash-object')) {
      const paths = argv.slice(argv.indexOf('--') + 1)
      return ok(paths.map(p => repo.dirty.get(p.replace('/proj/', '')) + '\n').join(''))
    }
    return { ...ok(''), exitCode: 128 }
  }
  return { repo, answer }
}

test('files a Bash command creates, changes or deletes are listed; untouched dirty files are not', async ($, on) => {
  const { repo, answer } = fakeGit()
  on('session.cwd', () => ({ value: '/proj' }))
  on('process.run', ($e, e) => ({ value: answer(e.argv) }))
  on('tool.call', () => {
    repo.dirty.set('src/new.ts', 'h1')
    repo.deleted.push('gone.ts')
    return { result: 'ok' as never }
  })

  await $.tool.call({ tool: 'Bash', command: 'make' })

  const ui = await $.ui.mount({ plugin: 'changed-files', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '2 files changed' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'src/new.ts ×1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'gone.ts ×1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /old\.ts/ })).toBeUndefined()
  await ui.unmount()
})

test('a file already dirty that a Bash command changes again is listed', async ($, on) => {
  const { repo, answer } = fakeGit()
  on('session.cwd', () => ({ value: '/proj' }))
  on('process.run', ($e, e) => ({ value: answer(e.argv) }))
  on('tool.call', () => {
    repo.dirty.set('old.ts', 'h2')
    return { result: 'ok' as never }
  })

  await $.tool.call({ tool: 'Bash', command: "sed -i '' s/a/b/ old.ts" })

  const ui = await $.ui.mount({ plugin: 'changed-files', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'old.ts ×1' })).toBeDefined()
  await ui.unmount()
})

test('outside a git repository a Bash command lists nothing and still runs', async ($, on) => {
  let ran = false
  on('session.cwd', () => ({ value: '/tmp' }))
  on('process.run', () => ({ value: { ...ok(''), exitCode: 128 } }))
  on('tool.call', () => {
    ran = true
    return { result: 'ok' as never }
  })

  await $.tool.call({ tool: 'Bash', command: 'touch x' })

  expect(ran).toBe(true)
  const ui = await $.ui.mount({ plugin: 'changed-files', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '0 files changed' })).toBeDefined()
  await ui.unmount()
})
