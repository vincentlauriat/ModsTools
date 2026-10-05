// Pure logic: spot Bash verification probes that can mislead.

export type Finding = { id: string; message: string }

type Segment = { raw: string; masked: string; sep: string; hasPipe: boolean; pipeInside: boolean }

// Split a command on top-level && || ; and newlines. `masked` hides quoted text (except $? in double quotes).
export function splitSegments(command: string): Segment[] {
  const segments: Segment[] = []
  let quote: string | null = null
  let depth = 0
  let start = 0
  let sep = ''
  let masked = ''
  let hasPipe = false
  let pipeInside = false
  const close = (end: number, next: string) => {
    segments.push({ raw: command.slice(start, end), masked, sep, hasPipe, pipeInside })
    start = end + next.length
    sep = next
    masked = ''
    hasPipe = false
    pipeInside = false
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i] ?? ''
    const two = command.slice(i, i + 2)
    if (quote === "'") {
      masked += c === "'" ? c : 'x'
      if (c === "'") quote = null
    } else if (quote === '"') {
      if (c === '"') {
        quote = null
        masked += c
      } else if (c === '\\') {
        masked += 'xx'
        i++
      } else masked += '|;&()'.includes(c) ? 'x' : c
    } else if (c === '\\') {
      masked += 'xx'
      i++
    } else if (c === "'" || c === '"') {
      quote = c
      masked += c
    } else if (c === '(') {
      depth++
      masked += c
    } else if (c === ')') {
      depth = Math.max(0, depth - 1)
      masked += c
    } else if (depth === 0 && (two === '&&' || two === '||')) {
      close(i, two)
      i++
    } else if (depth === 0 && (c === ';' || c === '\n')) close(i, c)
    else {
      if (c === '|') {
        if (depth === 0) hasPipe = true
        else pipeInside = true
      }
      masked += c
    }
  }
  close(command.length, '')

  return segments
}

const PIPEFAIL = /-\w*o\s+pipefail\b/
const GIT_GREP = /^\s*(?:rtk\s+)?(?:sudo\s+)?(?:\w+=\S*\s+)*git\s+(?:(?:-C\s+\S+|--no-pager)\s+)*grep\b/
const GREP = /^\s*(?:rtk\s+)?grep\b/
const NOT_FOUND = /not found|no match|absent|missing|none|not present|nothing/i
const EXISTS_CHECK = /\[\[?\s+!?\s*-[efdrs]\s|\btest\s+!?\s*-[efdrs]\s|\b(?:ls|stat)\s/
const ASSIGN_SUBST = /^\s*(?:(?:export|local|declare|readonly)\s+)?\w+=\$\(/

const MESSAGES = {
  'pipe-status': '$? after a pipeline is the last stage\'s status, not the command\'s. Use set -o pipefail or ${PIPESTATUS[0]}.',
  'assign-pipe-status': '$? after x=$(a | b) is the last stage\'s status, not a\'s. Use set -o pipefail or capture a on its own.',
  'grep-absent': 'grep || echo "not found" also fires when the file is missing. Check the path exists first.',
}

function reportsAbsence(segments: Segment[], i: number): boolean {
  const next = segments[i + 1]
  if (next === undefined) return false
  const candidate = next.sep === '||' ? next : next.sep === '&&' && segments[i + 2]?.sep === '||' ? segments[i + 2] : undefined

  return candidate !== undefined && /^\s*echo\b/.test(candidate.raw) && NOT_FOUND.test(candidate.raw)
}

function operandCount(masked: string): number {
  return masked.trim().split(/\s+/).slice(1).filter(token => !token.startsWith('-') && token !== '').length
}

// The misleading probes found in a Bash command, one finding per distinct pattern.
export function classify(command: string): Finding[] {
  const segments = splitSegments(command)
  const ids = new Set<keyof typeof MESSAGES>()
  const usesPipestatus = command.includes('PIPESTATUS')
  const hasExistsCheck = EXISTS_CHECK.test(command)
  let pipefail = false
  segments.forEach((segment, i) => {
    if (PIPEFAIL.test(segment.raw)) pipefail = true
    const prev = segments[i - 1]
    if (prev !== undefined && !pipefail && !usesPipestatus && segment.masked.includes('$?')) {
      if (prev.hasPipe) ids.add('pipe-status')
      else if (prev.pipeInside && ASSIGN_SUBST.test(prev.raw)) ids.add('assign-pipe-status')
    }
    if (GREP.test(segment.raw) && !segment.hasPipe && operandCount(segment.masked) >= 2 && !hasExistsCheck && reportsAbsence(segments, i)) ids.add('grep-absent')
  })

  return [...ids].map(id => ({ id, message: MESSAGES[id] }))
}

export type GitGrepScope = { dir: string | null; pathspecs: string[] }

const tokenize = (text: string): string[] =>
  [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(match => match[1] ?? match[2] ?? match[3] ?? '')

// The directory (-C) and pathspecs (after --) of the first `git grep` in a command, or null when there is none
// or it searches untracked files itself (--untracked, --no-index).
export function gitGrepScope(command: string): GitGrepScope | null {
  const segment = splitSegments(command).find(candidate => GIT_GREP.test(candidate.raw))
  if (segment === undefined) return null
  const all = tokenize(segment.raw)
  const pipe = all.indexOf('|')
  const tokens = all.slice(all.indexOf('git'), pipe === -1 ? undefined : pipe).filter(token => !/^\d*>/.test(token))
  const grep = tokens.indexOf('grep')
  if (tokens.slice(grep).some(token => token === '--untracked' || token === '--no-index')) return null
  const c = tokens.indexOf('-C')
  const dash = tokens.indexOf('--', grep)

  return { dir: c !== -1 && c < grep ? (tokens[c + 1] ?? null) : null, pathspecs: dash === -1 ? [] : tokens.slice(dash + 1) }
}

// How many untracked files `git status --porcelain` lists.
export const countUntracked = (stdout: string): number => stdout.split('\n').filter(line => line.startsWith('?? ')).length

export const untrackedFinding = (count: number): Finding => ({
  id: 'git-grep-untracked',
  message: `git grep found nothing, but ${count} untracked file(s) in that path were not searched — use grep -r`,
})
