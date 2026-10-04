import { describe, expect, test } from 'claude-code/testing'

import { CAP, duration, push, row, statusOf } from './history'

describe('history', () => {
  test('statusOf reads denial, exit code, plain failure and success', () => {
    expect(statusOf({ deny: 'no' })).toBe('denied')
    expect(statusOf({ isError: true, text: 'Exit code 2\nboom' })).toBe('✗ 2')
    expect(statusOf({ isError: true, text: 'something broke' })).toBe('✗')
    expect(statusOf({ result: { stdout: '', interrupted: true } })).toBe('interrupted')
    expect(statusOf({ result: { stdout: '', interrupted: false } })).toBe('✓')
  })

  test('push puts the newest first and keeps CAP entries', () => {
    let list = [] as ReturnType<typeof push>
    for (let i = 0; i < CAP + 5; i++) list = push(list, { command: `c${i}`, status: '✓', ms: 1 })
    expect(list).toHaveLength(CAP)
    expect(list[0]?.command).toBe(`c${CAP + 4}`)
  })

  test('row shows the first line only and truncates to the width', () => {
    expect(row({ command: 'echo a\necho b', status: '✓', ms: 1500 }, 60)).toBe('✓ echo a · 1.5s')
    const long = row({ command: 'x'.repeat(100), status: '✗ 1', ms: 20 }, 30)
    expect(long.length).toBeLessThanOrEqual(30)
    expect(long).toContain('…')
    expect(duration(999)).toBe('999ms')
  })
})
