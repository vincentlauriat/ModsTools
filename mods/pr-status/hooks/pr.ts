export type Check = {
  __typename?: string
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
  detailsUrl?: string
  targetUrl?: string
}

export type Pr = {
  number: number
  state: string
  isDraft: boolean
  reviewDecision: string
  mergeable: string
  title: string
  url: string
  statusCheckRollup: Check[]
}

export const FIELDS = 'number,state,isDraft,reviewDecision,statusCheckRollup,mergeable,title,url'

const FAILED = ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE', 'ACTION_REQUIRED', 'STALE', 'ERROR']
const PASSED = ['SUCCESS', 'NEUTRAL', 'SKIPPED']
const PR_COMMAND = /(^|[\s;&|(])(gh\s+pr\s+(create|merge|ready|review)|git\s+push)(\s|$)/

// Parses `gh pr view --json …` output; null when it is not a PR object.
export function parse(stdout: string): Pr | null {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const v = raw as Record<string, unknown>
  if (typeof v.number !== 'number') return null
  const str = (x: unknown) => (typeof x === 'string' ? x : '')

  return {
    number: v.number,
    state: str(v.state),
    isDraft: v.isDraft === true,
    reviewDecision: str(v.reviewDecision),
    mergeable: str(v.mergeable),
    title: str(v.title),
    url: str(v.url),
    statusCheckRollup: Array.isArray(v.statusCheckRollup) ? (v.statusCheckRollup.filter(c => typeof c === 'object' && c !== null) as Check[]) : [],
  }
}

export type Verdict = 'failed' | 'pending' | 'passed'

// CheckRun carries status + conclusion, StatusContext carries state.
export function verdict(c: Check): Verdict {
  if (c.__typename === 'StatusContext' || (c.status === undefined && c.state !== undefined)) {
    if (c.state !== undefined && FAILED.includes(c.state)) return 'failed'
    return c.state === 'SUCCESS' ? 'passed' : 'pending'
  }
  if (c.status !== 'COMPLETED') return 'pending'
  if (c.conclusion !== undefined && PASSED.includes(c.conclusion)) return 'passed'

  return 'failed'
}

export const checkName = (c: Check) => c.name ?? c.context ?? 'unnamed check'

export function failing(pr: Pr): Check[] {
  return pr.statusCheckRollup.filter(c => verdict(c) === 'failed')
}

const REVIEW: Record<string, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes requested',
  REVIEW_REQUIRED: 'review required',
}

const plural = (n: number) => `${n} check${n === 1 ? '' : 's'}`

function checksPart(pr: Pr): string | undefined {
  const verdicts = pr.statusCheckRollup.map(verdict)
  const failed = verdicts.filter(v => v === 'failed').length
  if (failed > 0) return `✗ ${plural(failed)}`
  if (verdicts.includes('pending')) return '⏳ checks'

  return verdicts.length > 0 ? '✓ checks' : undefined
}

// "PR #12 ✓ checks · approved", "PR #12 draft", "PR #12 merged".
export function statusLine(pr: Pr): string {
  const head = `PR #${pr.number}`
  if (pr.state === 'MERGED') return `${head} merged`
  if (pr.state === 'CLOSED') return `${head} closed`
  if (pr.isDraft) return `${head} draft`
  const parts = [checksPart(pr), REVIEW[pr.reviewDecision], pr.mergeable === 'CONFLICTING' ? 'conflicts' : undefined]
  const shown = parts.filter((p): p is string => p !== undefined)

  return shown.length === 0 ? head : `${head} ${shown.join(' · ')}`
}

export function summary(pr: Pr): string {
  const lines = [pr.title === '' ? statusLine(pr) : `${statusLine(pr)} — ${pr.title}`]
  if (pr.url !== '') lines.push(pr.url)
  const bad = failing(pr)
  if (bad.length > 0) lines.push('Failing checks:', ...bad.map(c => `  ✗ ${checkName(c)}`))
  const pending = pr.statusCheckRollup.filter(c => verdict(c) === 'pending')
  if (pending.length > 0) lines.push(`Pending checks: ${pending.map(checkName).join(', ')}`)
  if (pr.mergeable === 'CONFLICTING') lines.push('Merge conflicts with the base branch.')

  return lines.join('\n')
}

// Commands after which the PR state has likely changed.
export const touchesPr = (command: string): boolean => PR_COMMAND.test(command.replace(/\s+/g, ' '))

export const STALE_MS = 5 * 60_000
export const isStale = (last: number | undefined, now: number): boolean => last === undefined || now - last >= STALE_MS
