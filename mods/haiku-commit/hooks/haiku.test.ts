import { expect, test } from 'claude-code/testing'

import {
  BALANCE, LANGUAGES, LINE1, LINE2_TAIL, LINE2_TAIL_ONE, LINE3_TAIL, asHaiku, commitDir, commitType, extensionOf, filesPhrase, lineSyllables, parseShow, resolveDir,
  templateHaiku, wordSyllables,
} from './haiku'
import type { Commit } from './haiku'

test('commitDir finds the folder of the last git commit through rtk, env, cd and -C', async () => {
  expect(commitDir('git commit -m "feat: a"')).toBe('')
  expect(commitDir('rtk git commit -m x')).toBe('')
  expect(commitDir('GIT_AUTHOR_DATE=now git commit -m x')).toBe('')
  expect(commitDir('env FOO=1 git commit -m x')).toBe('')
  expect(commitDir('cd app && git add . && git commit -m x')).toBe('app')
  expect(commitDir('cd app && rtk git -C sub commit -m x')).toBe('app/sub')
  expect(commitDir('git -C /abs/repo commit -m x')).toBe('/abs/repo')
  expect(commitDir('git -c user.name=x commit -m x')).toBe('')
  expect(commitDir('(cd lib; git commit -am "fix: y")')).toBe('lib')
  expect(commitDir('git status')).toBeUndefined()
  expect(commitDir('echo "git commit"')).toBeUndefined()
  expect(commitDir('git log --grep commit')).toBeUndefined()
  expect(resolveDir('', '/p')).toBe('/p')
  expect(resolveDir('a/b', '/p/')).toBe('/p/a/b')
  expect(resolveDir('/x', '/p')).toBe('/x')
})

test('parseShow reads hash, subject, files, insertions, deletions and the main extension', async () => {
  const out = 'abcdef0123456789\nfix(api): retry\n\n10\t2\tsrc/a.ts\n1\t1\tREADME.md\n-\t-\timg/logo.png\n3\t0\tsrc/{old => new}.tsx\n'
  expect(parseShow(out)).toEqual({ hash: 'abcdef0123456789', subject: 'fix(api): retry', files: 4, insertions: 14, deletions: 3, ext: 'ts' })
  expect(parseShow('fatal: not a git repository')).toBeNull()
  expect(parseShow('abcdef0\nchore: empty\n')?.files).toBe(0)
  expect(extensionOf('a/b => c/d.swift')).toBe('swift')
  expect(extensionOf('Makefile')).toBe('')
  expect(extensionOf('.gitignore')).toBe('')
})

test('commitType reads the conventional type, other otherwise', async () => {
  expect(commitType('feat(ui)!: x')).toBe('feat')
  expect(commitType('Docs: y')).toBe('docs')
  expect(commitType('Update readme')).toBe('other')
})

test('wordSyllables approximates English', async () => {
  const cases: [string, number][] = [['code', 1], ['commit', 2], ['quiet', 2], ['garden', 2], ['files', 1], ['settles', 2], ['changed', 1], ['mended', 2], ['pages', 2], ['single', 2], ['morning', 2], ['today', 2], ['shape', 1]]
  for (const [w, n] of cases) expect([w, wordSyllables(w)]).toEqual([w, n])
  expect(lineSyllables('a new branch unfolds')).toBe(5)
})

// Every template phrase, counted by the approximate counter, matches the count it stands for.
test('template pools hold their syllable counts', async () => {
  for (const pool of [...Object.values(LINE1), ...Object.values(BALANCE)]) {
    for (const line of pool) expect([line, Math.abs(lineSyllables(line) - 5) <= 1]).toEqual([line, true])
  }
  for (const [n, pool] of Object.entries(LINE2_TAIL)) for (const t of pool) expect([t, lineSyllables(t)]).toEqual([t, Number(n)])
  for (const t of LINE2_TAIL_ONE) expect([t, lineSyllables(t)]).toEqual([t, 3])
  for (const [n, pool] of Object.entries(LINE3_TAIL)) for (const t of pool) expect([t, lineSyllables(t)]).toEqual([t, Number(n)])
})

const commit = (over: Partial<Commit> = {}): Commit => ({ hash: 'abc123', subject: 'feat: add', files: 3, insertions: 30, deletions: 2, ext: 'ts', ...over })

test('every template haiku is 5-7-5 by the stated counts and short', { timeoutMs: 30_000 }, async () => {
  const exts = ['', ...Object.keys(LANGUAGES), 'zzz']
  for (const type of [...Object.keys(LINE1), 'weird']) {
    for (const files of [0, 1, 2, 3, 7, 10, 11, 40]) {
      for (const ext of exts) {
        for (const hash of ['a1', 'b2', 'c3']) {
          const lines = templateHaiku(commit({ subject: `${type}: x`, files, ext, hash }))
          expect(lines).toHaveLength(3)
          for (const l of lines) expect(l.length <= 40).toBe(true)
          // Line 2 is built from a counted file phrase plus a tail of the matching count.
          const [phrase, n] = filesPhrase(files)
          expect(lines[1]!.startsWith(phrase)).toBe(true)
          expect(lineSyllables(lines[1]!.slice(phrase.length)) + n).toBe(7)
        }
      }
    }
  }
})

test('file phrases count their syllables', async () => {
  for (const files of [0, 1, 2, 7, 10, 11, 40]) {
    const [phrase, n] = filesPhrase(files)
    expect([phrase, lineSyllables(phrase)]).toEqual([phrase, n])
  }
})

test('the same commit always gets the same haiku; different hashes vary', async () => {
  expect(templateHaiku(commit())).toEqual(templateHaiku(commit()))
  const seen = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'].map(hash => templateHaiku(commit({ hash })).join('/')))
  expect(seen.size > 2).toBe(true)
})

test('insertions and deletions steer the closing line when no language line is chosen', async () => {
  const all = (over: Partial<Commit>) => ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(hash => templateHaiku(commit({ ext: '', hash, ...over }))[2]!)
  for (const l of all({ insertions: 100, deletions: 1 })) expect(BALANCE.grow.includes(l)).toBe(true)
  for (const l of all({ insertions: 1, deletions: 100 })) expect(BALANCE.shrink.includes(l)).toBe(true)
  for (const l of all({ insertions: 10, deletions: 10 })) expect(BALANCE.even.includes(l)).toBe(true)
})

test('asHaiku accepts three roughly 5-7-5 lines and refuses the rest', async () => {
  expect(asHaiku('Panes slide open wide\nA new window on the code\nThe morning light in')).toHaveLength(3)
  expect(asHaiku('"Panes slide open wide\n\nA new window on the code\nThe morning light in"\n')?.[0]).toBe('Panes slide open wide')
  expect(asHaiku('Sure! Here is a haiku.')).toBeNull()
  expect(asHaiku('a\nb\nc\nd')).toBeNull()
  expect(asHaiku('one\ntwo\nthree')).toBeNull()
})
