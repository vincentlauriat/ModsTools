import { describe, expect, test } from 'claude-code/testing'

import { failed, snapshot, untrackedLabel } from './diff'

describe('diff', () => {
  test('snapshot keeps the stat lines and counts only untracked entries', () => {
    const snap = snapshot(' a.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n', ' M a.ts\n?? b.ts\n?? c/\n')
    expect(snap.stat).toEqual([' a.ts | 2 +-', ' 1 file changed, 1 insertion(+), 1 deletion(-)'])
    expect(snap.untracked).toBe(2)
    expect(snap.error).toBeNull()
  })

  test('an empty diff and status give an empty snapshot', () => {
    expect(snapshot('', '')).toEqual({ error: null, stat: [], untracked: 0 })
  })

  test('failed carries the message; untrackedLabel pluralises', () => {
    expect(failed('x').error).toBe('x')
    expect(untrackedLabel(1)).toBe('1 untracked file')
    expect(untrackedLabel(0)).toBe('0 untracked files')
  })
})
