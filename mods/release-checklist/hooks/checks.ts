import type { Check, CheckState } from '../types'

export const NOTARY_PROFILE = 'AppliMacVincentGithub'
export const REMINDER =
  'Release done. Verify: spctl -a -t exec -vv <App>.app · xcrun stapler validate <dmg> · codesign --verify --deep --strict <App>.app'

/** What the pane gathers from the folder; null means unreadable or absent. */
export type Inputs = {
  version: string
  project: string | null
  release: string | null
  gitignore: string | null
  identities: string | null
  porcelain: string | null
  branch: string | null
  changes: string | null
}

const code = (text: string) => text.split('\n').filter(line => !/^\s*#/.test(line))

export const marketingVersions = (yml: string): string[] =>
  [...yml.matchAll(/^\s*MARKETING_VERSION:\s*["']?([^"'\s#]+)/gm)].map(one => one[1]!)

/** The default of `NOTARY_PROFILE="${NOTARY_PROFILE:-X}"`, comments ignored. */
export const notaryProfile = (script: string): string | null =>
  /^\s*(?:export\s+)?NOTARY_PROFILE="\$\{NOTARY_PROFILE:-([^}"]*)\}"/m.exec(code(script).join('\n'))?.[1] ?? null

export const releaseDir = (script: string): string | null =>
  /^\s*RELEASE_DIR=["']?([^"'\n]*)/m.exec(code(script).join('\n'))?.[1] ?? null

export const ignoresDmg = (gitignore: string): boolean =>
  code(gitignore).some(line => ['*.dmg', '**/*.dmg'].includes(line.trim()))

export const hasDeveloperId = (output: string): boolean => output.includes('Developer ID Application:')

const make = (label: string, state: CheckState, detail: string): Check => ({ label, state, detail })
const pass = (ok: boolean) => (ok ? 'ok' : 'fail')

export function runChecks(i: Inputs): Check[] {
  const list: Check[] = []

  if (i.project === null) list.push(make('project.yml', 'fail', 'missing'))
  else {
    const found = marketingVersions(i.project)
    const first = found[0]
    if (first === undefined) list.push(make('project.yml', 'fail', 'no MARKETING_VERSION'))
    else if (i.version === '') list.push(make('project.yml', 'ok', `MARKETING_VERSION ${first}`))
    else list.push(make('project.yml', pass(found.includes(i.version)), `MARKETING_VERSION ${found.join(', ')}, wanted ${i.version}`))
  }

  if (i.release === null) {
    list.push(make('release.sh', 'fail', 'Scripts/release.sh missing'))
    list.push(make('release/ output', 'skip', 'no release.sh'))
  } else {
    const profile = notaryProfile(i.release)
    list.push(
      make(
        'release.sh',
        pass(profile === NOTARY_PROFILE),
        profile === null ? 'no NOTARY_PROFILE default' : `NOTARY_PROFILE default ${profile}`,
      ),
    )
    const dir = releaseDir(i.release)
    list.push(
      make('release/ output', pass(dir !== null && dir.includes('/release')), dir === null ? 'no RELEASE_DIR' : `RELEASE_DIR ${dir}`),
    )
  }

  if (i.gitignore === null) list.push(make('.gitignore', 'fail', 'missing'))
  else list.push(make('.gitignore', pass(ignoresDmg(i.gitignore)), ignoresDmg(i.gitignore) ? '*.dmg ignored' : '*.dmg not ignored'))

  if (i.identities === null) list.push(make('Developer ID', 'skip', 'security unavailable'))
  else list.push(make('Developer ID', pass(hasDeveloperId(i.identities)), hasDeveloperId(i.identities) ? 'identity found' : 'no Developer ID Application identity'))

  if (i.porcelain === null || i.branch === null) list.push(make('git', 'skip', 'not a git repository'))
  else {
    const dirty = i.porcelain.split('\n').filter(line => line.trim() !== '').length
    const branch = i.branch.trim()
    const clean = dirty === 0
    const off = branch !== 'main'
    list.push(
      make(
        'git',
        pass(clean && off),
        `${clean ? 'clean' : `${dirty} change${dirty === 1 ? '' : 's'}`} on ${branch}${off ? '' : ' (not main!)'}`,
      ),
    )
  }

  if (i.version === '') list.push(make('CHANGES.md', 'skip', 'no version given'))
  else if (i.changes === null) list.push(make('CHANGES.md', 'fail', 'missing'))
  else {
    const mentioned = i.changes.includes(i.version)
    list.push(make('CHANGES.md', pass(mentioned), mentioned ? `mentions ${i.version}` : `no mention of ${i.version}`))
  }

  return list
}

export const mark = (state: CheckState) => (state === 'ok' ? '✓' : state === 'fail' ? '✗' : '–')

export function summary(checks: Check[]): string {
  const failed = checks.filter(one => one.state === 'fail').length
  return failed === 0 ? `${checks.length} checks, none failed` : `${failed} of ${checks.length} checks failed`
}

export function row(check: Check, columns: number): string {
  const line = `${mark(check.state)} ${check.label} · ${check.detail}`
  return line.length > columns ? line.slice(0, columns - 1) + '…' : line
}

export const isReleaseRun = (command: string) => /(^|[\s;&|/])release\.sh(\s|$)/.test(command)
