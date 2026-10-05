import { expect, test } from 'claude-code/testing'

import { allDone, finalToast, githubRepo, isUrl, parsePush, parseRuns, resolveDir, runLine, statusLine } from './ci'
import type { Run } from './ci'

const run = (over: Partial<Run>): Run => ({
  databaseId: 1,
  name: 'CI',
  workflowName: 'CI',
  status: 'completed',
  conclusion: 'success',
  url: 'https://github.com/owner/repo/actions/runs/1',
  ...over,
})

test('parsePush finds git push behind prefixes, cd and git -C', () => {
  expect(parsePush('git push')).toEqual({ dirs: [], remote: null })
  expect(parsePush('rtk git push -u origin feat/x')).toEqual({ dirs: [], remote: 'origin' })
  expect(parsePush('GIT_TRACE=0 env git push upstream')).toEqual({ dirs: [], remote: 'upstream' })
  expect(parsePush('cd app && git push')).toEqual({ dirs: ['app'], remote: null })
  expect(parsePush('cd /work/app && rtk git -C sub push --force-with-lease')).toEqual({ dirs: ['/work/app', 'sub'], remote: null })
  expect(parsePush('git -c push.default=current push')).toEqual({ dirs: [], remote: null })
  expect(parsePush('git push --signed upstream')).toEqual({ dirs: [], remote: 'upstream' })
  expect(parsePush('git push -o ci.skip origin')).toEqual({ dirs: [], remote: 'origin' })
  expect(parsePush('git add . && git commit -m "x" && git push origin HEAD')).toEqual({ dirs: [], remote: 'origin' })
})

test('parsePush ignores look-alikes, dry runs, deletes and unknown folders', () => {
  expect(parsePush('echo "git push"')).toBeNull()
  expect(parsePush('git status')).toBeNull()
  expect(parsePush('git push --dry-run')).toBeNull()
  expect(parsePush('git push origin --delete old')).toBeNull()
  expect(parsePush('cd "$DIR" && git push')).toBeNull()
  expect(parsePush('git -C ~/app push')).toBeNull()
  expect(parsePush('git pushx')).toBeNull()
})

test('resolveDir applies cd targets to the session folder', () => {
  expect(resolveDir('/work/repo', [])).toBe('/work/repo')
  expect(resolveDir('/work/repo', ['sub', '../other'])).toBe('/work/repo/other')
  expect(resolveDir('/work/repo', ['/abs/x', './y'])).toBe('/abs/x/y')
})

test('githubRepo reads https, ssh and scp-like remotes, nothing else', () => {
  expect(githubRepo('https://github.com/owner/repo.git')).toBe('owner/repo')
  expect(githubRepo('https://token@github.com/owner/repo')).toBe('owner/repo')
  expect(githubRepo('git@github.com:owner/my.repo.git')).toBe('owner/my.repo')
  expect(githubRepo('ssh://git@github.com/owner/repo.git\n')).toBe('owner/repo')
  expect(githubRepo('https://gitlab.com/owner/repo.git')).toBeNull()
  expect(githubRepo('/srv/git/repo.git')).toBeNull()
  expect(isUrl('git@github.com:owner/repo.git')).toBe(true)
  expect(isUrl('origin')).toBe(false)
})

test('parseRuns reads gh run list --json and refuses anything else', () => {
  const stdout = JSON.stringify([
    { conclusion: '', databaseId: 7, name: 'Build', status: 'in_progress', url: 'https://github.com/owner/repo/actions/runs/7', workflowName: 'CI' },
    { nope: true },
  ])
  expect(parseRuns(stdout)).toEqual([{ databaseId: 7, name: 'Build', workflowName: 'CI', status: 'in_progress', conclusion: '', url: 'https://github.com/owner/repo/actions/runs/7' }])
  expect(parseRuns('[]')).toEqual([])
  expect(parseRuns('{"message":"x"}')).toBeNull()
  expect(parseRuns('not json')).toBeNull()
})

test('statusLine counts running, passed and failed runs', () => {
  expect(statusLine([])).toBeUndefined()
  expect(statusLine([run({ status: 'queued', conclusion: '' }), run({ status: 'in_progress', conclusion: '' })])).toBe('CI ⏳ 2 running')
  expect(statusLine([run({}), run({ conclusion: 'skipped' }), run({ conclusion: 'neutral' })])).toBe('CI ✓ 3 passed')
  expect(statusLine([run({}), run({ conclusion: 'failure' })])).toBe('CI ✗ 1 failed')
  expect(statusLine([run({ status: 'in_progress', conclusion: '' }), run({ conclusion: 'cancelled' })])).toBe('CI ⏳ 1 running · ✗ 1 failed')
  expect(allDone([])).toBe(false)
  expect(allDone([run({}), run({ status: 'waiting', conclusion: '' })])).toBe(false)
})

test('finalToast names the failed workflows and the first failed run URL', () => {
  expect(finalToast([run({}), run({})], 'main')).toBe('CI ✓ all 2 passed on main')
  const failed = [
    run({}),
    run({ workflowName: 'Lint', conclusion: 'failure', url: 'https://github.com/owner/repo/actions/runs/2' }),
    run({ workflowName: 'Test', conclusion: 'timed_out', url: 'https://github.com/owner/repo/actions/runs/3' }),
  ]
  expect(finalToast(failed, 'feat/x')).toBe('CI ✗ failed on feat/x: Lint, Test — https://github.com/owner/repo/actions/runs/2')
  expect(runLine(failed[1]!)).toBe('✗ Lint · CI (failure) https://github.com/owner/repo/actions/runs/2')
  expect(runLine(run({ status: 'queued', conclusion: '' }))).toBe('⏳ CI (queued) https://github.com/owner/repo/actions/runs/1')
})
