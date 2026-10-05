import { expect, test } from 'claude-code/testing'

import { applyEvent, BADGES, EMPTY, listing, normalize } from './rules'
import type { Ev, State } from './rules'

const bash = (command: string, isError = false, stdout = ''): Ev => ({ kind: 'tool', tool: 'Bash', command, isError, stdout })

function run(events: Ev[], from: State = EMPTY) {
  let state = from
  const all: string[] = []
  for (const e of events) {
    const r = applyEvent(state, e)
    state = r.state
    all.push(...r.unlocked)
  }

  return { state, all }
}

test('there are at least 10 badges with unique ids', async () => {
  expect(BADGES.length).toBeGreaterThanOrEqual(10)
  expect(new Set(BADGES.map(b => b.id)).size).toBe(BADGES.length)
})

test('first tool call unlocks First Blood once only', async () => {
  const { all } = run([{ kind: 'tool', tool: 'Read', isError: false }, { kind: 'tool', tool: 'Read', isError: false }])
  expect(all).toEqual(['first-blood'])
})

test('100 Bash calls unlock Centurion, 50 Edits unlock Wordsmith', async () => {
  const b = run(Array.from({ length: 99 }, () => bash('ls')))
  expect(b.state.unlocked).not.toContain('centurion')
  expect(run([bash('ls')], b.state).all).toEqual(['centurion'])
  const edits = run(Array.from({ length: 50 }, () => ({ kind: 'tool', tool: 'Edit', isError: false }) as Ev))
  expect(edits.all).toContain('wordsmith')
})

test('time-of-day and duration badges', async () => {
  expect(run([{ kind: 'turn', hour: 0, durationMs: 1 }]).all).toEqual(['night-owl'])
  expect(run([{ kind: 'turn', hour: 4, durationMs: 1 }]).all).toEqual(['night-owl'])
  expect(run([{ kind: 'turn', hour: 5, durationMs: 1 }]).all).toEqual(['early-bird'])
  expect(run([{ kind: 'turn', hour: 7, durationMs: 1 }]).all).toEqual([])
  expect(run([{ kind: 'turn', hour: 12, durationMs: 600_000 }]).all).toEqual(['marathon'])
  expect(run([{ kind: 'turn', hour: 12, durationMs: 599_999 }]).all).toEqual([])
})

test('Subagent Wrangler needs 5 spawns in one session', async () => {
  expect(run([{ kind: 'spawn', count: 4 }]).all).toEqual([])
  expect(run([{ kind: 'spawn', count: 5 }]).all).toEqual(['subagent-wrangler'])
})

test('Green Light only for a succeeding test command', async () => {
  for (const c of ['npm test', 'vitest run', 'jest', 'pytest -q', 'cargo test', 'rtk cargo test', 'claude plugin test mods/x']) {
    expect(run([bash(c)]).all).toContain('green-light')
  }
  expect(run([bash('npm test', true)]).all).not.toContain('green-light')
  expect(run([bash('ls tests')]).all).not.toContain('green-light')
  expect(run([bash('test -f a')]).all).not.toContain('green-light')
})

test('Persistent: same command failing then succeeding', async () => {
  expect(run([bash('make', true), bash('make')]).all).toContain('persistent')
  expect(run([bash('make'), bash('make')]).all).not.toContain('persistent')
  expect(run([bash('make', true), bash('make build')]).all).not.toContain('persistent')
})

test('Shipper and Clean Slate', async () => {
  expect(run([bash('git push origin main')]).all).toContain('shipper')
  expect(run([bash('git push', true)]).all).not.toContain('shipper')
  const clean = 'On branch main\nnothing to commit, working tree clean'
  expect(run([bash('git status', false, clean)]).all).toContain('clean-slate')
  expect(run([bash('git status', false, 'Sur la branche main\nrien à valider, la copie de travail est propre')]).all).toContain('clean-slate')
  expect(run([bash('rtk git status', false, '* main\nclean — nothing to commit')]).all).toContain('clean-slate')
  expect(run([bash('git status', false, 'Changes not staged')]).all).not.toContain('clean-slate')
})

test('normalize repairs bad stored values and listing marks locked badges', async () => {
  expect(normalize('junk')).toEqual(EMPTY)
  expect(normalize({ unlocked: ['x', 3], bash: 'a' })).toEqual({ ...EMPTY, unlocked: ['x'] })
  const text = listing({ ...EMPTY, unlocked: ['shipper'] })
  expect(text).toContain('Achievements: 1/11')
  expect(text).toContain('✓ Shipper')
  expect(text).toContain('○ Centurion — Run 100 Bash commands')
})
