import { expect, test } from 'claude-code/testing'

import { commitMessages, lint, resolveFile, shellWords } from './rules'

const subject = (command: string) => commitMessages(command)[0]?.subject

test('shellWords keeps quoted arguments whole and splits chains', () => {
  expect(shellWords('git add . && git commit -m "feat: a b"')).toEqual([['git', 'add', '.'], ['git', 'commit', '-m', 'feat: a b']])
  expect(shellWords("echo 'a;b' | cat")).toEqual([['echo', 'a;b'], ['cat']])
})

test('-m with double and single quotes', () => {
  expect(subject('git commit -m "feat: add x"')).toBe('feat: add x')
  expect(subject("git commit -m 'fix(core): y'")).toBe('fix(core): y')
  expect(subject('git commit --message "docs: z"')).toBe('docs: z')
  expect(subject('git commit --message="docs: z"')).toBe('docs: z')
})

test('clustered and attached short flags', () => {
  expect(subject('git commit -am "chore: bump"')).toBe('chore: bump')
  expect(subject('git commit -m"chore: bump"')).toBe('chore: bump')
})

test('first -m is the subject', () => {
  expect(subject('git commit -m "feat: a" -m "body text"')).toBe('feat: a')
})

test('heredoc message gives its first line', () => {
  const cmd = `git commit -m "$(cat <<'EOF'\nfeat(ui): add pane\n\nlong body\nEOF\n)"`
  expect(subject(cmd)).toBe('feat(ui): add pane')
  expect(subject(`git commit -m "$(cat <<EOF\nbad subject\nEOF\n)"`)).toBe('bad subject')
})

test('rtk prefix, env prefix and git global options', () => {
  expect(subject('rtk git commit -m "feat: a"')).toBe('feat: a')
  expect(subject('FOO=1 git -c user.name=x commit -m "feat: a"')).toBe('feat: a')
  expect(commitMessages('git -C sub commit -m "feat: a"')[0]?.dir).toBe('sub')
})

test('chains: only the commit is read, cd is tracked', () => {
  const found = commitMessages('cd app && git add . && git commit -F msg.txt && git push')
  expect(found).toHaveLength(1)
  expect(found[0]).toEqual({ subject: null, file: 'msg.txt', dir: 'app' })
})

test('commands without a message give no subject', () => {
  expect(subject('git commit --amend --no-edit')).toBeNull()
  expect(subject('git commit -C HEAD~1')).toBeNull()
  expect(subject('git commit --reuse-message=HEAD')).toBeNull()
  expect(subject('git commit')).toBeNull()
  expect(commitMessages('git commit-tree abc')).toEqual([])
  expect(commitMessages('echo "git commit -m x"')).toEqual([])
})

test('resolveFile is relative to the cwd or the cd folder', () => {
  expect(resolveFile('m.txt', undefined, '/p')).toBe('/p/m.txt')
  expect(resolveFile('m.txt', 'app', '/p')).toBe('/p/app/m.txt')
  expect(resolveFile('/x/m.txt', 'app', '/p')).toBe('/x/m.txt')
})

test('lint accepts Conventional Commits', () => {
  for (const s of ['feat: a', 'fix(core): b', 'refactor(a-b)!: c', 'revert: d', 'chore!: e']) expect(lint(s, 100)).toBeNull()
})

test('lint refuses the rest', () => {
  for (const s of ['Add thing', 'feat:nospace', 'feat: ', 'feature: a', 'feat(): a', 'FEAT: a', 'fix a bug']) {
    expect(lint(s, 100)).not.toBeNull()
  }
  expect(lint('', 100)).toContain('empty')
})

test('lint exemptions: merge, fixup, squash, revert, unresolved substitutions', () => {
  for (const s of ['Merge branch x', 'fixup! feat: a', 'squash! a', 'Revert "feat: a"', '$(git log -1)', '$MSG']) {
    expect(lint(s, 100)).toBeNull()
  }
})

test('lint header length limit', () => {
  const long = `feat: ${'a'.repeat(95)}`
  expect(lint(long, 100)).toContain('101')
  expect(lint(long, 120)).toBeNull()
})
