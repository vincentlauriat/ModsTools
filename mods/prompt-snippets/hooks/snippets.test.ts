import { expect, test } from 'claude-code/testing'

import { expand, isValidName, parseCommand } from './snippets'

const S = { fix: 'Fix the bug.', 'a-b_1': 'AB' }

test('expands known tokens and leaves unknown ones, reporting them once', () => {
  expect(expand('do ;;fix then ;;nope and ;;nope ;;a-b_1', S)).toEqual({
    text: 'do Fix the bug. then ;;nope and ;;nope AB',
    unknown: ['nope'],
  })
})

test('respects word boundaries', () => {
  expect(expand('x;;fix ;;fixer ;;Fix ;;;fix', S).text).toBe('x;;fix ;;fixer ;;Fix ;;;fix')
  expect(expand('(;;fix) ;;fix.', S).text).toBe('(Fix the bug.) Fix the bug..')
})

test('does not expand inherited object keys', () => {
  expect(expand(';;constructor ;;__proto__', {})).toEqual({ text: ';;constructor ;;__proto__', unknown: ['constructor', '__proto__'] })
})

test('validates names', () => {
  expect(isValidName('ok-1_x')).toBe(true)
  for (const bad of ['', 'Bad', 'a b', 'é', 'a;']) expect(isValidName(bad)).toBe(false)
})

test('parses the subcommands', () => {
  expect(parseCommand('add hi Hello  world ')).toEqual({ action: 'add', name: 'hi', text: 'Hello  world' })
  expect(parseCommand('rm hi')).toEqual({ action: 'rm', name: 'hi' })
  expect(parseCommand('')).toEqual({ action: 'list' })
  expect(parseCommand('show Bad').action).toBe('error')
  expect(parseCommand('add hi').action).toBe('error')
  expect(parseCommand('zap x').action).toBe('error')
})
