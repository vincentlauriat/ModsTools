import { describe, expect, test } from 'claude-code/testing'

import { EMPTY, flakyList, isTestCommand, normalize, record, row } from './flaky'
import type { Ev } from './flaky'
import type { FlakyState } from '../types'

const run = (events: Ev[]) => events.reduce<{ state: FlakyState; flaky: string[] }>(
  (acc, ev) => {
    const out = record(acc.state, ev)
    return { state: out.state, flaky: out.newlyFlaky === null ? acc.flaky : [...acc.flaky, out.newlyFlaky] }
  },
  { state: EMPTY, flaky: [] },
)
const t = (cmd: string, ok: boolean, at = 1000): Ev => ({ kind: 'test', cmd, ok, at })
const edit: Ev = { kind: 'edit' }

describe('normalize', () => {
  test('strips rtk, env prefixes and collapses spaces', () => {
    expect(normalize('  CI=1 NODE_ENV=test   rtk   vitest  run ')).toBe('vitest run')
    expect(normalize('cd app && rtk npm  test')).toBe('cd app && npm test')
  })

  test('recognises test commands only', () => {
    expect(isTestCommand('rtk cargo test --lib')).toBe(true)
    expect(isTestCommand('xcodebuild -scheme App test')).toBe(true)
    expect(isTestCommand('claude plugin test mods/x')).toBe(true)
    expect(isTestCommand('npm run build')).toBe(false)
    expect(isTestCommand('git status')).toBe(false)
  })
})

describe('record', () => {
  test('fail then pass with no edit is flaky, reported once', () => {
    const { state, flaky } = run([t('npm test', false), t('npm test', true), t('npm test', false), t('npm test', true)])
    expect(flaky).toEqual(['npm test'])
    expect(state.tests['npm test']).toMatchObject({ fails: 2, passes: 2, flaky: true })
  })

  test('fail, edit, pass is not flaky', () => {
    const { state, flaky } = run([t('npm test', false), edit, t('npm test', true)])
    expect(flaky).toEqual([])
    expect(flakyList(state)).toEqual([])
  })

  test('a pass with no prior failure is not flaky', () => {
    expect(run([t('npm test', true), t('npm test', true)]).flaky).toEqual([])
  })

  test('different commands are independent', () => {
    const { flaky } = run([t('npm test', false), t('pytest', true), edit, t('npm test', true)])
    expect(flaky).toEqual([])
    expect(run([t('npm test', false), t('pytest', false), t('pytest', true)]).flaky).toEqual(['pytest'])
  })

  test('rtk and env variants count as the same command', () => {
    const { flaky } = run([t('rtk vitest run', false), t('CI=1 vitest   run', true)])
    expect(flaky).toEqual(['vitest run'])
  })

  test('an edit between the last failure and the pass clears the suspicion, an earlier edit does not', () => {
    expect(run([edit, t('jest', false), t('jest', true)]).flaky).toEqual(['jest'])
    expect(run([t('jest', false), edit, t('jest', false), t('jest', true)]).flaky).toEqual(['jest'])
  })

  test('flakyList sorts most recent first and counts edits', () => {
    expect(run([edit, edit]).state.edits).toBe(2)
    const s2 = run([t('npm test', false, 1), t('npm test', true, 2), t('pytest', false, 5), t('pytest', true, 9)]).state
    expect(flakyList(s2).map(f => f.cmd)).toEqual(['pytest', 'npm test'])
  })

  test('row shows counts and truncates the command', () => {
    const rec = { fails: 2, passes: 3, failedAtEdit: null, flaky: true, lastSeen: 0 }
    const d = new Date(0)
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    expect(row('npm test', rec, 80)).toBe(`npm test · 2 fail / 3 pass · ${hhmm}`)
    expect(row('x'.repeat(100), rec, 40)).toContain('…')
  })
})
