import { expect, test } from 'claude-code/testing'

import { addEntry, dayKey, firstLine, formatDay, formatWeek, projectName } from './journal'
import type { Entry } from './journal'

const at = (d: number, h = 10) => new Date(2026, 9, d, h, 5).getTime()
const e = (time: number, project = 'app', prompt = 'p'): Entry => ({ time, project, prompt, tools: 2, files: 1 })

test('firstLine takes the first non-empty line, truncated to 80', () => {
  expect(firstLine('\n  hello\nworld')).toBe('hello')
  expect(firstLine('x'.repeat(200))).toHaveLength(80)
  expect(firstLine('')).toBe('')
})

test('projectName is the folder basename', () => {
  expect(projectName('/a/b/MyApp/')).toBe('MyApp')
})

test('addEntry prunes entries older than 30 days and caps at 2000', () => {
  const now = at(30)
  const old = e(now - 31 * 86_400_000)
  expect(addEntry([old, e(now - 1000)], e(now), now)).toHaveLength(2)
  const many = Array.from({ length: 2000 }, (_, i) => e(now - 5000 + i, 'x', String(i)))
  const out = addEntry(many, e(now, 'x', 'last'), now)
  expect(out).toHaveLength(2000)
  expect(out[0]?.prompt).toBe('1')
  expect(out[1999]?.prompt).toBe('last')
})

test('formatDay groups by project and keeps other days out', () => {
  const out = formatDay([e(at(4), 'a', 'one'), e(at(4, 11), 'b', 'two'), e(at(4, 12), 'a', 'three'), e(at(3), 'a', 'old')], at(4, 20))
  expect(out).toContain('a (2 turns)')
  expect(out).toContain('b (1 turn)')
  expect(out).toContain('10:05 one · 2 tools · 1 file')
  expect(out).not.toContain('old')
  expect(formatDay([], at(4))).toBe(`No journal entries for ${dayKey(at(4))}.`)
})

test('formatWeek counts per day and project, newest first', () => {
  const out = formatWeek([e(at(4), 'a'), e(at(4), 'b'), e(at(4), 'a'), e(at(2), 'a'), e(at(20), 'z')], at(4, 20))
  const lines = out.split('\n')
  expect(lines[1]).toBe(`${dayKey(at(4))}: a 2, b 1`)
  expect(lines[2]).toBe(`${dayKey(at(2))}: a 1`)
  expect(out).toContain('Total: 4 turns')
  expect(out).not.toContain('z ')
})
