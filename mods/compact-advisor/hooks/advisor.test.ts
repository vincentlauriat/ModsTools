import { expect, test } from 'claude-code/testing'

import { compactLine, firstLine, isUserGoal, openTodos, step, toastText, touch } from './advisor'

test('step toasts once per crossing and re-arms only below threshold - 10', async () => {
  expect(step(true, 84, 85)).toEqual({ armed: true, toast: false })
  expect(step(true, 85, 85)).toEqual({ armed: false, toast: true })
  expect(step(false, 92, 85)).toEqual({ armed: false, toast: false })
  expect(step(false, 76, 85)).toEqual({ armed: false, toast: false })
  expect(step(false, 75, 85)).toEqual({ armed: false, toast: false })
  expect(step(false, 74.9, 85)).toEqual({ armed: true, toast: false })
  expect(step(true, undefined, 85)).toEqual({ armed: true, toast: false })
  expect(toastText(85.4)).toBe('Context 85% — /compact-advisor for a suggested /compact')
})

test('only typed prompts that are not slash commands become the goal', async () => {
  expect(isUserGoal('composer', '\n  Fix the login bug\nmore')).toBe(true)
  expect(firstLine('\n  Fix the login bug\nmore')).toBe('Fix the login bug')
  expect(isUserGoal('composer', '/compact-advisor')).toBe(false)
  expect(isUserGoal('task-notification', 'background done')).toBe(false)
  expect(isUserGoal('composer', '   ')).toBe(false)
})

test('touch keeps each path once, most recent last', async () => {
  expect(touch(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a'])
})

test('openTodos returns the first three open items only', async () => {
  const md = '# Todo\n- [x] done\n- [ ] one\n  * [ ] two\n- [ ]\n+ [ ] three\n- [ ] four\n'
  expect(openTodos(md)).toEqual(['one', 'two', 'three'])
})

test('compactLine joins what is known, caps files at the 10 most recent', async () => {
  const files = Array.from({ length: 12 }, (_, i) => `f${i}.ts`)
  const line = compactLine({ branch: 'feat/x', files, todos: ['a; b', 'c'], goal: 'ship  the recap' })
  expect(line).toBe(
    '/compact Keep: branch feat/x; files edited: f2.ts, f3.ts, f4.ts, f5.ts, f6.ts, f7.ts, f8.ts, f9.ts, f10.ts, f11.ts; open tasks: a, b | c; last decision/goal: ship the recap',
  )
  expect(compactLine({ branch: null, files: [], todos: [], goal: 'only goal' })).toBe('/compact Keep: last decision/goal: only goal')
  expect(compactLine({ branch: null, files: [], todos: [], goal: '' })).toBe('/compact')
})
