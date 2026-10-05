import { describe, expect, test } from 'claude-code/testing'

import { findClaim, isCheckCommand, isCodePath } from './verify'

describe('isCheckCommand', () => {
  test('recognises build, test and lint commands', () => {
    for (const command of [
      'xcodebuild -scheme App build',
      'swift test',
      'npm run build',
      'npm test',
      'pnpm run lint',
      'yarn test',
      'npx tsc --noEmit',
      'vitest run',
      'pytest -q',
      'cargo clippy',
      'go vet ./...',
      'make all',
      'claude plugin test mods/x',
      'swiftlint',
      'eslint .',
    ]) expect(isCheckCommand(command)).toBe(true)
  })

  test('sees through rtk, sudo and env prefixes', () => {
    expect(isCheckCommand('rtk cargo test')).toBe(true)
    expect(isCheckCommand('sudo make install')).toBe(true)
    expect(isCheckCommand('CI=1 NODE_ENV=test rtk npm run test')).toBe(true)
    expect(isCheckCommand('rtk err swift build')).toBe(true)
    expect(isCheckCommand('rtk test ./run.sh')).toBe(true)
  })

  test('finds a check in any segment of a chain', () => {
    expect(isCheckCommand('cd app && npm run build')).toBe(true)
    expect(isCheckCommand('git add . ; go test ./... || true')).toBe(true)
  })

  test('ignores commands that are not checks', () => {
    for (const command of ['git status', 'ls -la', 'rtk git diff', 'npm install', 'echo make', 'cat tsc.log', 'test -f a']) {
      expect(isCheckCommand(command)).toBe(false)
    }
  })
})

describe('isCodePath', () => {
  test('excludes Markdown and text, keeps code', () => {
    expect(isCodePath('/a/b.ts')).toBe(true)
    expect(isCodePath('/a/Makefile')).toBe(true)
    expect(isCodePath('/a/README.md')).toBe(false)
    expect(isCodePath('/a/notes.TXT')).toBe(false)
  })
})

describe('findClaim', () => {
  test('finds French claims, with accents', () => {
    expect(findClaim("C'est corrigé.")).toBe('corrigé')
    expect(findClaim('Ça marche maintenant')).toBe('ça marche')
    expect(findClaim('Les tests passent.')).toBe('tests passent')
    expect(findClaim('Build réussi, terminé !')).toBe('build réussi')
    expect(findClaim("Voilà, c'est bon.")).toBe("c'est bon")
  })

  test('finds English claims', () => {
    expect(findClaim('Fixed the null check.')).toBe('fixed')
    expect(findClaim('It works now.')).toBe('it works')
    expect(findClaim('All tests pass.')).toBe('all tests pass')
    expect(findClaim('The build succeeds.')).toBe('build succeeds')
    expect(findClaim('Done.')).toBe('done')
  })

  test('ignores negations, questions and suppositions', () => {
    expect(findClaim("Ce n'est pas encore corrigé.")).toBeNull()
    expect(findClaim('Pas encore terminé.')).toBeNull()
    expect(findClaim('This is not fixed.')).toBeNull()
    expect(findClaim("It isn't done.")).toBeNull()
    expect(findClaim('Is it fixed?')).toBeNull()
    expect(findClaim("Si c'est corrigé, relance.")).toBeNull()
    expect(findClaim('Once it is done we ship.')).toBeNull()
  })

  test('ignores claims inside code and finds none in neutral prose', () => {
    expect(findClaim('Run `echo done` then:\n```sh\necho "fixed"\n```\nI changed the file.')).toBeNull()
    expect(findClaim('I edited the parser and renamed two helpers.')).toBeNull()
    expect(findClaim('')).toBeNull()
  })

  test('a claim in a later sentence is still found', () => {
    expect(findClaim("Je n'ai pas lancé le build. C'est corrigé.")).toBe('corrigé')
  })

  test('does not match inside longer words', () => {
    expect(findClaim('The prefixed value is undone by the unfixed path.')).toBeNull()
  })
})
