import { expect, test } from 'claude-code/testing'

import { absolute, isFresh, isProtected, parentDir, parseBranches, targetPath } from './rules'

test('parseBranches reads a comma-separated list and falls back to main,master', () => {
  expect([...parseBranches(undefined)]).toEqual(['main', 'master'])
  expect([...parseBranches('')]).toEqual(['main', 'master'])
  expect([...parseBranches(' , ')]).toEqual(['main', 'master'])
  expect([...parseBranches('develop, release')]).toEqual(['develop', 'release'])
  expect([...parseBranches(42)]).toEqual(['main', 'master'])
})

test('isProtected matches names exactly', () => {
  const set = parseBranches('main,master')
  expect(isProtected('main', set)).toBe(true)
  expect(isProtected('master', set)).toBe(true)
  expect(isProtected('feat/main', set)).toBe(false)
  expect(isProtected('HEAD', set)).toBe(false)
})

test('isFresh holds for 30 seconds', () => {
  expect(isFresh(1000, 30_999)).toBe(true)
  expect(isFresh(1000, 31_000)).toBe(false)
})

test('targetPath reads file_path or notebook_path', () => {
  expect(targetPath({ file_path: '/a/b.ts' })).toBe('/a/b.ts')
  expect(targetPath({ notebook_path: '/a/n.ipynb' })).toBe('/a/n.ipynb')
  expect(targetPath({ file_path: '' })).toBeNull()
  expect(targetPath({})).toBeNull()
  expect(targetPath(undefined)).toBeNull()
})

test('absolute and parentDir', () => {
  expect(absolute('a/b.ts', '/proj/')).toBe('/proj/a/b.ts')
  expect(absolute('/x/y', '/proj')).toBe('/x/y')
  expect(parentDir('/a/b/c.ts')).toBe('/a/b')
  expect(parentDir('/a')).toBe('/')
  expect(parentDir('/')).toBeNull()
})
