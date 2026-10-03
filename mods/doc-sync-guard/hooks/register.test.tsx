import { expect, test } from 'claude-code/testing'
import type { FsStat, On, ProcessRunResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false } as never } as const
const START = 1_000_000

const file = (mtimeMs: number): FsStat => ({ kind: 'file', size: 1, mtimeMs, isLink: false }) as FsStat
const git = (paths: string[], exitCode = 0): ProcessRunResult => ({
  exitCode, stdout: paths.map(p => p + '\0').join(''), stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
})

// A project at /proj whose files have the given mtimes; `dirty` is what git lists as modified or new.
function project(on: On, mtimes: Record<string, number>, dirty: string[] = []) {
  on('session.cwd', () => ({ value: '/proj' }))
  on('clock.now', () => ({ value: START }))
  on('fs.stat', ($, e) => {
    const at = mtimes[e.path.replace('/proj/', '')]
    if (at === undefined) throw new Error('ENOENT')
    return { value: file(at) }
  })
  on('process.run', () => ({ value: git(dirty) }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine's own band</Text>
  })
}

async function turn($: Engine) {
  await $.prompt.submit({ text: 'do it' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
  const ui = await $.ui.mount({ plugin: 'doc-sync-guard', surface: 'terminal', ...BAND })
  const band = await ui.find({ type: 'Text', text: /Not updated/ })
  await ui.unmount()
  return band?.text
}

test('a turn that changed code through Bash but left both docs untouched is flagged', async ($, on) => {
  project(on, { 'COMMANDS.md': START - 10, 'CHANGES.md': START - 10, 'src/a.ts': START + 5 }, ['src/a.ts'])
  expect(await turn($)).toBe('⚠ Not updated this turn: COMMANDS.md, CHANGES.md ')
})

test('a turn that updated both docs shows nothing', async ($, on) => {
  project(on, { 'COMMANDS.md': START + 1, 'CHANGES.md': START + 2, 'src/a.ts': START + 5 }, ['src/a.ts'])
  expect(await turn($)).toBeUndefined()
})

test('a question-only turn needs the journal, not the changelog', async ($, on) => {
  project(on, { 'COMMANDS.md': START - 10, 'CHANGES.md': START - 10, 'src/old.ts': START - 99 }, ['src/old.ts'])
  expect(await turn($)).toBe('⚠ Not updated this turn: COMMANDS.md ')
})

test('a project without COMMANDS.md or CHANGES.md is left alone', async ($, on) => {
  project(on, { 'src/a.ts': START + 5 }, ['src/a.ts'])
  expect(await turn($)).toBeUndefined()
})
