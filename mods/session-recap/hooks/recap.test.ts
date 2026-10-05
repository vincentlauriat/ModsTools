import { expect, test } from 'claude-code/testing'

import {
  EMPTY,
  addChecks,
  addFile,
  addPr,
  checkKinds,
  parseCommit,
  parseLogLine,
  parsePr,
  recap,
  resolveDir,
  segments,
  withOutput,
} from './recap'

test('segments split on shell operators but not inside quotes', async () => {
  expect(segments('cd a && git commit -m "x; y" || echo no | tail')).toEqual(['cd a', 'git commit -m "x; y"', 'echo no', 'tail'])
})

test('checkKinds recognises tests and builds behind rtk and env prefixes', async () => {
  expect(checkKinds('rtk npm run test')).toEqual(['npm test'])
  expect(checkKinds('CI=1 pnpm test && rtk tsc --noEmit')).toEqual(['pnpm test', 'tsc'])
  expect(checkKinds('python3 -m pytest -q; cargo test; go test ./...')).toEqual(['pytest', 'cargo test', 'go test'])
  expect(checkKinds('xcodebuild -scheme App build | xcpretty')).toEqual(['xcodebuild'])
  expect(checkKinds('claude plugin test mods/x && swift test && rtk vitest run && jest')).toEqual([
    'claude plugin test',
    'swift test',
    'vitest',
    'jest',
  ])
  expect(checkKinds('rtk proxy npx -y -p typescript tsc -p cfg')).toEqual(['tsc'])
  expect(checkKinds('rtk test npm test')).toEqual(['npm test'])
  expect(checkKinds('rtk err cargo test && npx --package=jest jest')).toEqual(['cargo test', 'jest'])
  expect(checkKinds('npm install && echo test && git status')).toEqual([])
})

test('parseCommit reads -C, a preceding cd and the -m subject', async () => {
  expect(parseCommit('git commit -m "feat: add x"')).toEqual({ message: 'feat: add x' })
  expect(parseCommit("rtk git -C sub commit -am 'fix: y'")).toEqual({ dir: 'sub', message: 'fix: y' })
  expect(parseCommit('cd /repo && git add . && git commit --message=wip')).toEqual({ dir: '/repo', message: 'wip' })
  expect(parseCommit('git commit')).toEqual({})
  expect(parseCommit('git log --grep commit')).toBeNull()
  expect(parseCommit('echo git commit')).toBeNull()
})

test('resolveDir and parseLogLine', async () => {
  expect(resolveDir(undefined, '/proj')).toBe('/proj')
  expect(resolveDir('sub', '/proj/')).toBe('/proj/sub')
  expect(resolveDir('/abs', '/proj')).toBe('/abs')
  expect(parseLogLine('1a2b3c4 feat: thing\n')).toEqual({ sha: '1a2b3c4', subject: 'feat: thing' })
  expect(parseLogLine('')).toBeNull()
})

test('parsePr takes the number from arguments or output URLs', async () => {
  expect(parsePr('gh pr create --title t --body b')).toEqual({ action: 'created' })
  expect(parsePr('gh pr merge 12 --squash')).toEqual({ action: 'merged', number: 12 })
  expect(parsePr('rtk gh pr merge https://github.com/o/r/pull/7')).toEqual({
    action: 'merged',
    number: 7,
    url: 'https://github.com/o/r/pull/7',
  })
  expect(parsePr('gh pr view 3')).toBeNull()
  expect(withOutput({ action: 'created' }, 'anything\nhttps://github.com/o/r/pull/42\n')).toEqual({
    action: 'created',
    number: 42,
    url: 'https://github.com/o/r/pull/42',
  })
  expect(withOutput({ action: 'created' }, 'no link')).toEqual({ action: 'created' })
})

test('the log keeps files distinct, PRs deduplicated and counts runs per kind', async () => {
  let log = addFile(addFile(addFile(EMPTY, 'a.ts'), 'b.ts'), 'a.ts')
  expect(log.files).toEqual(['a.ts', 'b.ts'])
  log = addPr(addPr(log, { action: 'merged', number: 3 }), { action: 'merged', number: 3 })
  expect(log.prs.length).toBe(1)
  log = addChecks(addChecks(addChecks(log, ['tsc'], true), ['tsc'], false), ['tsc', 'jest'], true)
  expect(log.checks).toEqual([
    { kind: 'tsc', pass: 2, fail: 1 },
    { kind: 'jest', pass: 1, fail: 0 },
  ])
})

test('recap renders Markdown sections with duration, cost and none for empty ones', async () => {
  const log = addChecks(addFile(EMPTY, 'a.ts'), ['tsc'], false)
  const out = recap({ ...log, commits: [{ sha: 'abc1234', subject: 'feat: x' }] }, { startedAt: 0, usd: 1.5 }, 65 * 60_000)
  expect(out).toContain('- Duration: 1h05m')
  expect(out).toContain('- Cost: $1.50')
  expect(out).toContain('### Files changed (1)')
  expect(out).toContain('- `a.ts`')
  expect(out).toContain('- `abc1234` feat: x')
  expect(out).toContain('### Pull requests (0)')
  expect(out).toContain('- none')
  expect(out).toContain('- tsc: 1 run · 0 passed · 1 failed')
  expect(recap(EMPTY, { startedAt: 0 }, 0)).toContain('- Cost: not available')
})
