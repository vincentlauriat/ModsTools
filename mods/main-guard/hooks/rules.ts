const PROTECTED = new Set(['main', 'master'])

// `git tag` options that only read tags.
const TAG_READS = new Set(['-l', '--list', '-n', '--contains', '--no-contains', '--points-at', '--merged', '--no-merged', '-v', '--verify', '--column', '--sort'])

// Each simple command of a shell line as words, leading env assignments and `rtk` dropped.
export function segments(command: string): string[][] {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map(part => {
      const words = part.trim().split(/\s+/).filter(Boolean)
      let i = 0
      while (words[i] !== undefined && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]!)) i++
      if (words[i] === 'rtk') i++

      return words.slice(i)
    })
    .filter(words => words.length > 0)
}

// The words after `git` and its global options, or null when it is not git.
function gitArgs(words: string[]): string[] | null {
  if (words[0] !== 'git') return null
  let i = 1
  while (words[i]?.startsWith('-')) i += words[i] === '-C' || words[i] === '-c' ? 2 : 1

  return words.slice(i)
}

const branchOf = (ref: string) => ref.replace(/^\+/, '').replace(/^refs\/heads\//, '')

function checkPush(args: string[], branch: string | undefined): string | null {
  const flags = args.filter(a => a.startsWith('-'))
  const positional = args.filter(a => !a.startsWith('-'))
  if (flags.some(f => f === '-f' || f.startsWith('--force'))) return 'force push'
  if (flags.some(f => f === '--mirror' || f === '--all')) return 'pushing every branch'
  if (flags.some(f => f === '--tags' || f === '--follow-tags')) return 'pushing tags'

  const refspecs = positional.slice(1)
  if (refspecs.length === 0) {
    return branch !== undefined && PROTECTED.has(branch) ? `pushing ${branch}` : null
  }
  for (const refspec of refspecs) {
    if (refspec.startsWith('+')) return 'force push'
    if (refspec === 'tag' || refspec.startsWith('refs/tags/')) return 'pushing tags'
    const target = branchOf(refspec.includes(':') ? refspec.split(':').pop()! : refspec)
    const resolved = target === 'HEAD' ? branch : target
    if (resolved !== undefined && PROTECTED.has(resolved)) return `pushing to ${resolved}`
  }

  return null
}

function checkTag(args: string[]): string | null {
  const isRead = args.length === 0 || args.some(a => TAG_READS.has(a) || /^-n\d+$/.test(a) || a.startsWith('--sort=') || a.startsWith('--format='))

  return isRead ? null : 'creating or deleting a tag'
}

/**
 * Why the command must not run without approval, or null when it may.
 * `branch` is the current git branch, needed for a bare `git push`.
 */
export function check(command: string, branch: string | undefined): string | null {
  for (const words of segments(command)) {
    if (words[0] === 'gh' && words[1] === 'release' && ['create', 'delete', 'edit'].includes(words[2] ?? '')) {
      return 'creating or changing a GitHub release'
    }
    const args = gitArgs(words)
    if (args === null) continue
    const reason = args[0] === 'push' ? checkPush(args.slice(1), branch) : args[0] === 'tag' ? checkTag(args.slice(1)) : null
    if (reason !== null) return reason
  }

  return null
}

export const mentionsPush = (command: string) => /\bpush\b/.test(command)

/**
 * The folder the first `git push` of the line runs in: its `git -C` folder,
 * else the last `cd` before it; undefined for the session's own folder.
 */
export function pushDir(command: string): string | undefined {
  let dir: string | undefined
  for (const words of segments(command)) {
    if (words[0] === 'cd' && words[1] !== undefined) dir = words[1]
    if (gitArgs(words)?.[0] !== 'push') continue
    const at = words.indexOf('-C')

    return at > 0 && at < words.indexOf('push') ? words[at + 1] : dir
  }

  return undefined
}
