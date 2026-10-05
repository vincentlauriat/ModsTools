import { describe, expect, test } from 'claude-code/testing'

import {
  hasDeveloperId,
  ignoresDmg,
  isReleaseRun,
  marketingVersions,
  notaryProfile,
  releaseDir,
  row,
  runChecks,
  summary,
} from './checks'
import type { Inputs } from './checks'

const RELEASE = `#!/bin/bash
#   NOTARY_PROFILE="MarkdownViewer-Notary"          ./Scripts/release.sh 0.5.1
NOTARY_PROFILE="\${NOTARY_PROFILE:-AppliMacVincentGithub}"
RELEASE_DIR="$ROOT/release"
`

const good: Inputs = {
  version: '0.10.0',
  project: 'targets:\n  App:\n    settings:\n      base:\n        MARKETING_VERSION: "0.10.0"\n        X: "$(MARKETING_VERSION)"\n',
  release: RELEASE,
  gitignore: '# builds\n*.dmg\n',
  identities: '1) ABC "Developer ID Application: Jane Doe (ABCDE12345)"\n',
  porcelain: '',
  branch: 'feat/x\n',
  changes: '## 0.10.0\n- stuff',
}

const states = (i: Inputs) => runChecks(i).map(c => c.state)

describe('checks', () => {
  test('parsers read quoted, bare and repeated MARKETING_VERSION', () => {
    expect(marketingVersions('  MARKETING_VERSION: "0.10.0"\n  MARKETING_VERSION: 1.2\n  V: "$(MARKETING_VERSION)"')).toEqual(['0.10.0', '1.2'])
    expect(marketingVersions('name: x')).toEqual([])
  })

  test('notaryProfile reads the code default, never the comment', () => {
    expect(notaryProfile(RELEASE)).toBe('AppliMacVincentGithub')
    expect(notaryProfile('# NOTARY_PROFILE="${NOTARY_PROFILE:-Old}"\n')).toBeNull()
    expect(notaryProfile('NOTARY_PROFILE="${NOTARY_PROFILE:-Other}"')).toBe('Other')
  })

  test('releaseDir and ignoresDmg', () => {
    expect(releaseDir(RELEASE)).toBe('$ROOT/release')
    expect(releaseDir('RELEASE_DIR="$ROOT"')).toBe('$ROOT')
    expect(ignoresDmg('*.dmg')).toBe(true)
    expect(ignoresDmg('/*.dmg\n# *.dmg\nfoo.dmg')).toBe(false)
  })

  test('hasDeveloperId and isReleaseRun', () => {
    expect(hasDeveloperId('0 valid identities found')).toBe(false)
    expect(hasDeveloperId('"Developer ID Application: V (K)"')).toBe(true)
    expect(isReleaseRun('./Scripts/release.sh 0.1.0')).toBe(true)
    expect(isReleaseRun('cd x && bash Scripts/release.sh')).toBe(true)
    expect(isReleaseRun('cat release.sh.bak')).toBe(false)
    expect(isReleaseRun('echo release')).toBe(false)
  })

  test('a fully good project passes every check', () => {
    expect(states(good)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'])
    expect(summary(runChecks(good))).toBe('7 checks, none failed')
  })

  test('the expected notary profile is configurable', () => {
    const other = { ...good, release: RELEASE.replace('AppliMacVincentGithub', 'MyProfile') }
    expect(runChecks(other, 'MyProfile')[1]?.state).toBe('ok')
    expect(runChecks(good, 'MyProfile')[1]?.state).toBe('fail')
  })

  test('each broken input fails its own check', () => {
    expect(states({ ...good, version: '9.9.9' })[0]).toBe('fail')
    expect(states({ ...good, release: RELEASE.replace('AppliMacVincentGithub', 'Nope') })[1]).toBe('fail')
    expect(states({ ...good, release: RELEASE.replace('$ROOT/release', '$ROOT') })[2]).toBe('fail')
    expect(states({ ...good, gitignore: '*.zip' })[3]).toBe('fail')
    expect(states({ ...good, identities: '0 valid identities found' })[4]).toBe('fail')
    expect(states({ ...good, porcelain: ' M a.ts\n' })[5]).toBe('fail')
    expect(states({ ...good, branch: 'main' })[5]).toBe('fail')
    expect(states({ ...good, changes: '## 0.9.0' })[6]).toBe('fail')
  })

  test('missing files and tools fail or skip, no version skips CHANGES', () => {
    const none = runChecks({ ...good, version: '', project: null, release: null, gitignore: null, identities: null, porcelain: null, branch: null, changes: null })
    expect(none.map(c => c.state)).toEqual(['fail', 'fail', 'skip', 'fail', 'skip', 'skip', 'skip'])
    expect(runChecks({ ...good, version: '' })[0]?.detail).toBe('MARKETING_VERSION 0.10.0')
  })

  test('row marks and truncates', () => {
    expect(row({ label: 'git', state: 'skip', detail: 'x' }, 40)).toBe('– git · x')
    expect(row({ label: 'git', state: 'fail', detail: 'y'.repeat(50) }, 20)).toHaveLength(20)
  })
})
