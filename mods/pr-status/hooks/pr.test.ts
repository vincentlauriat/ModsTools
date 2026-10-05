import { describe, expect, test } from 'claude-code/testing'

import { failing, isStale, parse, statusLine, summary, touchesPr } from './pr'

const run = (name: string, status: string, conclusion: string) => ({
  __typename: 'CheckRun',
  completedAt: '2026-01-01T00:00:00Z',
  conclusion,
  detailsUrl: 'https://github.com/example/repo/actions/runs/1/job/2',
  name,
  startedAt: '2026-01-01T00:00:00Z',
  status,
  workflowName: 'CI',
})
const ctx = (context: string, state: string) => ({ __typename: 'StatusContext', context, state, targetUrl: 'https://ci.example.com/1' })

const pr = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    number: 12,
    state: 'OPEN',
    isDraft: false,
    reviewDecision: '',
    mergeable: 'MERGEABLE',
    title: 'feat: example change',
    url: 'https://github.com/example/repo/pull/12',
    statusCheckRollup: [],
    ...over,
  })
const line = (over: Record<string, unknown>) => statusLine(parse(pr(over))!)

describe('parse', () => {
  test('reads a real-shaped gh payload', () => {
    const p = parse(pr({ statusCheckRollup: [run('build', 'COMPLETED', 'SUCCESS')] }))!
    expect(p).toMatchObject({ number: 12, state: 'OPEN', isDraft: false, title: 'feat: example change' })
    expect(p.statusCheckRollup).toHaveLength(1)
  })

  test('rejects junk and non-PR objects', () => {
    expect(parse('')).toBeNull()
    expect(parse('no pull requests found')).toBeNull()
    expect(parse('{"a":1}')).toBeNull()
    expect(parse('[]')).toBeNull()
  })

  test('tolerates missing fields', () => {
    expect(parse('{"number":3}')).toMatchObject({ number: 3, state: '', statusCheckRollup: [] })
  })
})

describe('statusLine', () => {
  test('green checks and approved', () => {
    expect(line({ reviewDecision: 'APPROVED', statusCheckRollup: [run('a', 'COMPLETED', 'SUCCESS'), run('b', 'COMPLETED', 'SKIPPED'), ctx('c', 'SUCCESS')] })).toBe('PR #12 ✓ checks · approved')
  })

  test('failing checks are counted and win over pending', () => {
    const rollup = [run('a', 'COMPLETED', 'FAILURE'), ctx('b', 'ERROR'), run('c', 'IN_PROGRESS', ''), run('d', 'COMPLETED', 'SUCCESS')]
    expect(line({ reviewDecision: 'CHANGES_REQUESTED', statusCheckRollup: rollup })).toBe('PR #12 ✗ 2 checks · changes requested')
    expect(line({ statusCheckRollup: [run('a', 'COMPLETED', 'TIMED_OUT')] })).toBe('PR #12 ✗ 1 check')
  })

  test('pending checks', () => {
    expect(line({ statusCheckRollup: [run('a', 'QUEUED', ''), ctx('b', 'PENDING')] })).toBe('PR #12 ⏳ checks')
  })

  test('draft, merged and closed ignore checks', () => {
    expect(line({ isDraft: true, statusCheckRollup: [run('a', 'COMPLETED', 'FAILURE')] })).toBe('PR #12 draft')
    expect(line({ state: 'MERGED', reviewDecision: 'APPROVED' })).toBe('PR #12 merged')
    expect(line({ state: 'CLOSED' })).toBe('PR #12 closed')
  })

  test('no checks and no review shows the bare number; conflicts and review required show', () => {
    expect(line({})).toBe('PR #12')
    expect(line({ reviewDecision: 'REVIEW_REQUIRED', mergeable: 'CONFLICTING' })).toBe('PR #12 review required · conflicts')
  })
})

describe('summary', () => {
  test('lists title, url and each failing check name', () => {
    const text = summary(parse(pr({ statusCheckRollup: [run('lint', 'COMPLETED', 'FAILURE'), ctx('ci/legacy', 'FAILURE'), run('build', 'COMPLETED', 'SUCCESS'), run('e2e', 'IN_PROGRESS', '')] }))!)
    expect(text).toContain('PR #12 ✗ 2 checks — feat: example change')
    expect(text).toContain('https://github.com/example/repo/pull/12')
    expect(text).toContain('  ✗ lint')
    expect(text).toContain('  ✗ ci/legacy')
    expect(text).not.toContain('✗ build')
    expect(text).toContain('Pending checks: e2e')
    expect(failing(parse(pr())!)).toEqual([])
  })
})

describe('refresh triggers', () => {
  test('touchesPr matches PR commands and pushes only', () => {
    expect(touchesPr('gh pr create --fill')).toBe(true)
    expect(touchesPr('rtk gh pr merge 12 --squash')).toBe(true)
    expect(touchesPr('git add . && git push origin main')).toBe(true)
    expect(touchesPr('gh pr ready')).toBe(true)
    expect(touchesPr('gh pr view')).toBe(false)
    expect(touchesPr('git pull')).toBe(false)
  })

  test('staleness is five minutes', () => {
    expect(isStale(undefined, 0)).toBe(true)
    expect(isStale(0, 299_999)).toBe(false)
    expect(isStale(0, 300_000)).toBe(true)
  })
})
