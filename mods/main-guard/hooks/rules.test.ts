import { describe, expect, test } from 'claude-code/testing'

import { check } from './rules'

describe('refused', () => {
  const cases: [string, string | undefined][] = [
    ['git push origin main', 'feat/x'],
    ['git push origin HEAD:main', 'feat/x'],
    ['git push origin feat/x:refs/heads/master', 'feat/x'],
    ['git push', 'main'],
    ['git push origin', 'main'],
    ['git push origin HEAD', 'main'],
    ['git push -f origin feat/x', 'feat/x'],
    ['git push --force-with-lease', 'feat/x'],
    ['git push origin +feat/x', 'feat/x'],
    ['git push --tags', 'feat/x'],
    ['git push origin v1.0 --follow-tags', 'feat/x'],
    ['git push origin refs/tags/v1.0', 'feat/x'],
    ['git tag v1.0', 'feat/x'],
    ['git tag -a v1.0 -m "release"', 'feat/x'],
    ['git tag -d v1.0', 'feat/x'],
    ['gh release create v1.0', 'feat/x'],
    ['rtk git add . && rtk git commit -m x && rtk git push origin main', 'feat/x'],
    ['GIT_TRACE=1 git -C repo push origin main', 'feat/x'],
  ]
  for (const [command, branch] of cases) {
    test(`${command} (on ${branch})`, () => {
      expect(check(command, branch)).not.toBeNull()
    })
  }
})

describe('allowed', () => {
  const cases: [string, string | undefined][] = [
    ['git push -u origin feat/changed-files', 'feat/changed-files'],
    ['git push', 'feat/x'],
    ['rtk git push', 'feat/x'],
    ['git status && git log --oneline', 'main'],
    ['git tag', 'feat/x'],
    ['git tag -l "v*"', 'feat/x'],
    ['git tag --list', 'feat/x'],
    ['git checkout main', 'feat/x'],
    ['git pull origin main', 'feat/x'],
    ['git merge main', 'feat/x'],
    ['echo "git push origin main is forbidden"', 'feat/x'],
    ['gh release list', 'feat/x'],
  ]
  for (const [command, branch] of cases) {
    test(`${command} (on ${branch})`, () => {
      expect(check(command, branch)).toBeNull()
    })
  }
})
