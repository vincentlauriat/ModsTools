import { expect, test } from 'claude-code/testing'

import { formatContext, nextTodos, parseStatus } from './context'

const STATUS = '# branch.oid abc\n# branch.head feat/x\n# branch.upstream origin/feat/x\n# branch.ab +2 -1\n1 .M N... 100644 100644 100644 a b f.ts\n? new.ts\n'

test('parseStatus reads branch, ahead/behind and dirty count', () => {
  expect(parseStatus(STATUS)).toEqual({ branch: 'feat/x', ahead: 2, behind: 1, dirty: 2 })
  expect(parseStatus('# branch.head main\n')).toEqual({ branch: 'main', ahead: 0, behind: 0, dirty: 0 })
})

test('nextTodos prefers the Next heading, caps at 5', () => {
  const md = '# T\n- [ ] early\n## Next\n- [ ] a\n- [x] done\n- [ ] b\n- [ ] c\n- [ ] d\n- [ ] e\n- [ ] f\n## Later\n- [ ] z\n'
  expect(nextTodos(md)).toEqual(['a', 'b', 'c', 'd', 'e'])
})

test('nextTodos falls back to the first unchecked anywhere', () => {
  expect(nextTodos('- [x] no\n- [ ] one\n## Later\n- [ ] two\n')).toEqual(['one', 'two'])
  expect(nextTodos('nothing')).toEqual([])
})

test('formatContext lays out git and todos, null when empty', () => {
  const out = formatContext({ branch: 'm', ahead: 1, behind: 0, dirty: 3, subject: 'fix: x' }, ['a'])
  expect(out).toContain('Git branch: m (ahead 1)')
  expect(out).toContain('Uncommitted files: 3')
  expect(out).toContain('Last commit: fix: x')
  expect(out).toContain('- [ ] a')
  expect(formatContext(null, [])).toBeNull()
  expect(formatContext(null, ['a'])).not.toContain('Git')
})
