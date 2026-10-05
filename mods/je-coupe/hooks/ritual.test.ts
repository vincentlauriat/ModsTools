import { expect, test } from 'claude-code/testing'

import { bandLabel, instruction, isJeCoupe, staleDocs } from './ritual'

test('matches je coupe case/accent/punctuation-insensitively', () => {
  for (const ok of ['je coupe', 'Je coupe !', '  JE  COUPÉ', 'je coupe, merci', 'Je-coupe.']) expect(isJeCoupe(ok)).toBe(true)
})

test('does not match other prompts', () => {
  for (const no of ['', 'bonjour je coupe', 'je couperaisun fichier', 'je', 'coupe']) expect(isJeCoupe(no)).toBe(false)
})

test('staleDocs keeps docs older than the session start', () => {
  const docs = [{ name: 'A.md', mtimeMs: 50 }, { name: 'B.md', mtimeMs: 100 }, { name: 'C.md', mtimeMs: 150 }]
  expect(staleDocs(docs, 100)).toEqual(['A.md'])
})

test('instruction lists the docs and flags the untouched ones', () => {
  const text = instruction([{ name: 'A.md', mtimeMs: 1 }, { name: 'B.md', mtimeMs: 9 }], 5)
  expect(text).toContain('A.md (NOT modified this session), B.md.')
})

test('bandLabel pluralises', () => {
  expect(bandLabel(['A.md'])).toBe('Je coupe: 1 doc not updated yet: A.md')
  expect(bandLabel(['A.md', 'B.md'])).toBe('Je coupe: 2 docs not updated yet: A.md, B.md')
})
