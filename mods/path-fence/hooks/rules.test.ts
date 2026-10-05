import { describe, expect, test } from 'claude-code/testing'

import { bashOutside, bashTargets, fileOutside, isAllowed, normalize, parseRoots } from './rules'

const fence = { cwd: '/Users/me/proj', home: '/Users/me', extraRoots: ['~/Shared', '/opt/work'] }

describe('normalize', () => {
  test('resolves .. and .', () => expect(normalize('/a/b/../c/./d', '/x', undefined)).toBe('/a/c/d'))
  test('anchors a relative path on cwd', () => expect(normalize('src/../x', '/p', undefined)).toBe('/p/x'))
  test('expands ~', () => expect(normalize('~/a', '/p', '/Users/me')).toBe('/Users/me/a'))
  test('~ without HOME is unresolvable', () => expect(normalize('~/a', '/p', undefined)).toBe(null))
  test('cannot climb above /', () => expect(normalize('/../..', '/p', undefined)).toBe('/'))
})

describe('isAllowed', () => {
  const inside = [
    '/Users/me/proj/a.ts', 'src/a.ts', './x', '/Users/me/proj', '~/proj/b', '/Users/me/.claude/CLAUDE.md', '~/.claude/x',
    '/tmp/x', '/private/tmp/claude/x', '/var/folders/ab/T/x', '/Users/me/Shared/f', '/opt/work/a', '/tmp/../tmp/ok',
  ]
  const outside = [
    '/etc/hosts', '/Users/me/other/a.ts', '../other/a.ts', '/Users/me/proj/../other/a', '/Users/me/projx/a',
    '~/.zshrc', '/Users/me/.claudex/x', '/tmpfoo/x', '/tmp/../etc/passwd', '~/Shared/../secret', '/opt/workshop/a', '/',
  ]
  for (const p of inside) test(`inside: ${p}`, () => expect(isAllowed(p, fence)).toBe(true))
  for (const p of outside) test(`outside: ${p}`, () => expect(isAllowed(p, fence)).toBe(false))
})

describe('roots option', () => {
  test('comma-separated string', () => expect(parseRoots(' /a , ~/b ,')).toEqual(['/a', '~/b']))
  test('list', () => expect(parseRoots(['/a', '/b'])).toEqual(['/a', '/b']))
  test('anything else is empty', () => expect(parseRoots(undefined)).toEqual([]))
})

describe('file tools', () => {
  test('Write outside', () => expect(fileOutside({ file_path: '/etc/x' }, fence)).toBe('/etc/x'))
  test('NotebookEdit outside', () => expect(fileOutside({ notebook_path: '~/n.ipynb' }, fence)).toBe('~/n.ipynb'))
  test('Edit inside', () => expect(fileOutside({ file_path: '/Users/me/proj/a' }, fence)).toBe(null))
})

describe('bash', () => {
  const asks = [
    'echo hi > /etc/x', 'echo hi >> ~/.zshrc', 'echo hi >~/.zshrc', 'echo hi 1> ../other/f', 'make &> ~/log',
    'cat a | tee ~/out', 'rm ~/old.txt', 'rm -rf ../other', 'mv a.txt ~/Desktop/', 'mv ~/Desktop/a.txt .',
    'cp a.txt /etc/', 'touch ../x', 'mkdir /opt/new', 'sudo rm /usr/local/x', 'cd p && echo x > $HOME/f',
    'ln -s a ~/bin/a', 'install -m755 x /usr/local/bin/x',
  ]
  const allowed = [
    'echo hi > out.txt', 'echo hi > /dev/null', 'make 2>&1', 'make > /tmp/log 2>&1', 'rm -rf build', 'cp a b',
    'cp ~/Desktop/a.txt .', 'ls ~/x', 'cat ~/.zshrc', 'mv a b', 'echo $X > $TMPDIR/f', 'echo "a > b"', 'git status',
    'echo hi > ~/.claude/notes.md',
  ]
  for (const c of asks) test(`asks: ${c}`, () => expect(bashOutside(c, fence)).not.toBe(null))
  for (const c of allowed) test(`allows: ${c}`, () => expect(bashOutside(c, fence)).toBe(null))
  test('targets of a mixed line', () => expect(bashTargets('echo a > x; rm y').sort()).toEqual(['x', 'y']))
})
