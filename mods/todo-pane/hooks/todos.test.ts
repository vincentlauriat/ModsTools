import { describe, expect, test } from 'claude-code/testing'

import { parse, toggle } from './todos'

const FILE = '# Todos\n\n## Now\n- [ ] write tests\n- [x] ship band\nsome prose\n## Later\n  - [X] nested\n- not a box\n'

describe('parse', () => {
  test('keeps level-2 headings and checkbox lines with their line index', async () => {
    expect(parse(FILE)).toEqual([
      { index: 2, kind: 'heading', text: 'Now', done: false },
      { index: 3, kind: 'todo', text: 'write tests', done: false },
      { index: 4, kind: 'todo', text: 'ship band', done: true },
      { index: 6, kind: 'heading', text: 'Later', done: false },
      { index: 7, kind: 'todo', text: 'nested', done: true },
    ])
  })

  test('handles CRLF line endings', async () => {
    expect(parse('## A\r\n- [ ] b\r\n')).toEqual([
      { index: 0, kind: 'heading', text: 'A', done: false },
      { index: 1, kind: 'todo', text: 'b', done: false },
    ])
  })
})

describe('toggle', () => {
  test('flips only the bracket of the matching line, both ways', async () => {
    expect(toggle(FILE, 3, 'write tests')).toBe(FILE.replace('- [ ] write tests', '- [x] write tests'))
    expect(toggle(FILE, 4, 'ship band')).toBe(FILE.replace('- [x] ship band', '- [ ] ship band'))
    expect(toggle(FILE, 7, 'nested')).toBe(FILE.replace('  - [X] nested', '  - [ ] nested'))
  })

  test('keeps CRLF endings and the trailing newline byte for byte', async () => {
    expect(toggle('## A\r\n- [ ] b\r\n', 1, 'b')).toBe('## A\r\n- [x] b\r\n')
  })

  test('refuses when the line moved, changed or is not a checkbox', async () => {
    expect(toggle(FILE, 3, 'ship band')).toBeNull()
    expect(toggle(FILE, 5, 'some prose')).toBeNull()
    expect(toggle(FILE, 99, 'x')).toBeNull()
  })
})
