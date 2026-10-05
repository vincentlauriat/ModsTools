import { expect, test } from 'claude-code/testing'

import { buildBrief, inProgress, lastCommands, lastLines, stateBullets, truncate } from './brief'

const COMMANDS = '# Commands log\n\n## 1 — 2026-01-01\nfirst\n\n## 2 — 2026-01-02\nsecond\nline two\n\n## 4 — 2026-01-03\nthird\n\n## 5 — 2026-01-04\nfourth\n'

test('lastCommands keeps the last 3 entries, joins multi-line bodies, tolerates numbering gaps', () => {
  expect(lastCommands(COMMANDS)).toEqual(['#2 2026-01-02: second line two', '#4 2026-01-03: third', '#5 2026-01-04: fourth'])
})

test('lastCommands truncates to 200 chars and handles CRLF', () => {
  const out = lastCommands(`## 1 — 2026-01-01\r\n${'x'.repeat(500)}\r\n`)
  expect(out).toHaveLength(1)
  expect(Array.from(out[0]!.split(': ')[1]!)).toHaveLength(200)
  expect(out[0]).toMatch(/…$/)
})

test('lastCommands: empty or heading-less file gives nothing', () => {
  expect(lastCommands('')).toEqual([])
  expect(lastCommands('# Commands log\n\njust prose\n')).toEqual([])
})

const MEMORY = '---\nlast_updated: x\n---\n# M\n\n## State\n- a\n- b wraps\n  onto next\n- c\n- d\n- e\n\n## Decisions\n- not state\n'

test('stateBullets takes the last 4 bullets of ## State only, with continuations', () => {
  expect(stateBullets(MEMORY)).toEqual(['- b wraps onto next', '- c', '- d', '- e'])
})

test('stateBullets: missing section, empty file, CRLF, truncation to 300', () => {
  expect(stateBullets('## Decisions\n- x\n')).toEqual([])
  expect(stateBullets('')).toEqual([])
  expect(stateBullets('## State\r\n- one\r\n- two\r\n')).toEqual(['- one', '- two'])
  expect(Array.from(stateBullets(`## State\n- ${'y'.repeat(400)}\n`)[0]!)).toHaveLength(2 + 300)
})

const PLAN = '# P\n## Phase 1 — Done ✅\n- ✅ a\n## Phase 2 — Doing 🟡 (branch x)\n- ✅ finished\n- 🟡 `mod` — working\n- ⬜ later\n## Phase 3 — Todo ⬜\n- ⬜ nope\n## Phase 4 — Also 🟡\n- 🟡 more\n'

test('inProgress lists 🟡 phases with their 🟡/⬜ sub-bullets only', () => {
  expect(inProgress(PLAN)).toEqual(['Phase 2 — Doing 🟡 (branch x)', '  - 🟡 `mod` — working', '  - ⬜ later', 'Phase 4 — Also 🟡', '  - 🟡 more'])
})

test('inProgress: caps at 8 lines, no 🟡 phase, CRLF', () => {
  const many = `## Phase 1 🟡\n${Array.from({ length: 20 }, (_, i) => `- ⬜ t${i}`).join('\n')}\n`
  expect(inProgress(many)).toHaveLength(8)
  expect(inProgress('## Phase 1 ✅\n- ⬜ x\n')).toEqual([])
  expect(inProgress('## Phase 1 🟡\r\n- 🟡 a\r\n')).toEqual(['Phase 1 🟡', '  - 🟡 a'])
})

test('lastLines keeps the last 5 non-empty lines', () => {
  expect(lastLines('1\n\n2\n3\n\n4\n5\n6\n')).toEqual(['2', '3', '4', '5', '6'])
  expect(lastLines('\n\n')).toEqual([])
})

test('truncate never splits an emoji', () => {
  expect(truncate('🟡🟡🟡🟡', 3)).toBe('🟡🟡…')
})

test('buildBrief: null when nothing, skips missing parts, stays within 30 lines', () => {
  expect(buildBrief({})).toBeNull()
  expect(buildBrief({ commands: '', memory: null, plan: '', changes: '\n' })).toBeNull()
  const some = buildBrief({ changes: 'did a thing\n' })
  expect(some).toContain('Recent changes (CHANGES.md):\ndid a thing')
  expect(some).not.toContain('PLAN.md')
  const big = buildBrief({ commands: COMMANDS, memory: MEMORY, plan: PLAN, changes: 'a\nb\nc\nd\ne\nf\n' })!
  expect(big.split('\n').length).toBeLessThanOrEqual(30)
})
