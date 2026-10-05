const IS_COMMIT = /\bgit[ \t]+(?:[^\s;&|]+[ \t]+)*?commit\b/
const NAMES_CLAUDE = /claude|anthropic/i

// A whole `-m "<trailer>"` / `--trailer "<trailer>"` argument.
const TRAILER_ARG = /[ \t]+(?:-m|--message|--trailer)(?:[ \t]+|=)(["'])[ \t]*Co-Authored-By:[^"'\n]*["']/gi
// A trailer line inside a message, with the line break before it.
const TRAILER_LINE = /\n[ \t]*Co-Authored-By:[^\n"'<]*(?:<[^>\n]*>)?[ \t]*/gi

export const isCommit = (command: string) => IS_COMMIT.test(command)

function heredocEnds(command: string): string[] {
  return [...command.matchAll(/<<-?[ \t]*(["']?)(\w+)\1/g)].map(m => m[2]!)
}

// True when nothing of the message follows: a closing quote, the end, or a heredoc terminator line.
function endsMessage(rest: string, ends: string[]): boolean {
  if (/^\s*(["']|$)/.test(rest)) return true
  const next = /^\n[ \t]*(\w+)[ \t]*(\n|\)|$)/.exec(rest)

  return next !== null && ends.includes(next[1]!)
}

/**
 * The command without the Claude/Anthropic Co-Authored-By trailers of its
 * `git commit` messages, and how many were removed. Other co-authors stay.
 */
export function stripClaudeTrailers(command: string): { command: string; removed: number } {
  if (!isCommit(command)) return { command, removed: 0 }
  let removed = 0
  let out = command.replace(TRAILER_ARG, arg => {
    if (!NAMES_CLAUDE.test(arg)) return arg
    removed++

    return ''
  })

  const ends = heredocEnds(out)
  let result = ''
  let from = 0
  for (const m of out.matchAll(TRAILER_LINE)) {
    if (!NAMES_CLAUDE.test(m[0])) continue
    let start = m.index
    const end = start + m[0].length
    if (endsMessage(out.slice(end), ends)) {
      while (start > from && /\s/.test(out[start - 1]!)) start--
    }
    result += out.slice(from, start)
    from = end
    removed++
  }
  out = result + out.slice(from)

  return { command: out, removed }
}
