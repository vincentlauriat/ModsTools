import { describe, expect, test } from 'claude-code/testing'

import { bandText, checkLanguages, languageOf } from './gate'

describe('languageOf', () => {
  test('maps source extensions to a language', () => {
    expect(languageOf('/p/App.swift')).toBe('Swift')
    for (const path of ['a.ts', 'a.tsx', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs']) expect(languageOf(path)).toBe('TS/JS')
    expect(languageOf('x.py')).toBe('Python')
    expect(languageOf('x.rs')).toBe('Rust')
    expect(languageOf('x.go')).toBe('Go')
    for (const path of ['a.c', 'a.cc', 'a.cpp', 'a.m', 'a.mm', 'a.h']) expect(languageOf(path)).toBe('C/ObjC')
  })

  test('returns null for non-source files', () => {
    for (const path of ['README.md', 'a.json', 'Makefile', 'a.swift.bak', 'noext', 'a.constructor']) expect(languageOf(path)).toBeNull()
  })
})

describe('checkLanguages', () => {
  test('Swift and C/ObjC checks', () => {
    expect(checkLanguages('xcodebuild -scheme A build')).toEqual(['Swift', 'C/ObjC'])
    expect(checkLanguages('swift test')).toEqual(['Swift'])
    expect(checkLanguages('make all')).toEqual(['C/ObjC'])
    expect(checkLanguages('clang -c a.c')).toEqual(['C/ObjC'])
  })

  test('TS/JS checks', () => {
    for (const command of ['tsc --noEmit', 'npm run build', 'npm test', 'pnpm run typecheck', 'yarn lint', 'vitest run', 'jest', 'claude plugin validate mods/x', 'claude plugin test mods/x'])
      expect(checkLanguages(command)).toEqual(['TS/JS'])
  })

  test('Python, Rust and Go checks', () => {
    expect(checkLanguages('pytest -q')).toEqual(['Python'])
    expect(checkLanguages('python3 -m pytest')).toEqual(['Python'])
    expect(checkLanguages('mypy src')).toEqual(['Python'])
    expect(checkLanguages('ruff check .')).toEqual(['Python'])
    expect(checkLanguages('cargo clippy')).toEqual(['Rust'])
    expect(checkLanguages('go vet ./...')).toEqual(['Go'])
  })

  test('strips rtk, sudo and env prefixes', () => {
    expect(checkLanguages('rtk cargo test')).toEqual(['Rust'])
    expect(checkLanguages('rtk err swift build')).toEqual(['Swift'])
    expect(checkLanguages('rtk test pytest')).toEqual(['Python'])
    expect(checkLanguages('sudo make install')).toEqual(['C/ObjC'])
    expect(checkLanguages('CI=1 NODE_ENV=test rtk npm run test')).toEqual(['TS/JS'])
    expect(checkLanguages('rtk npx tsc')).toEqual(['TS/JS'])
  })

  test('splits on && ; || and newlines', () => {
    expect(checkLanguages('cd app && swift build; cargo test').sort()).toEqual(['Rust', 'Swift'])
    expect(checkLanguages('git status\nnpm run build')).toEqual(['TS/JS'])
    expect(checkLanguages('false || go test ./...')).toEqual(['Go'])
  })

  test('ignores commands that are not checks', () => {
    for (const command of ['git status', 'ls -la', 'echo cargo test', 'npm install', 'rtk git diff', 'cat build.sh', 'test -f a'])
      expect(checkLanguages(command)).toEqual([])
  })
})

test('bandText lists the languages', () => {
  expect(bandText(['Swift', 'Python'])).toBe('⚙ build-gate: Swift, Python changed, no build run this turn')
})
