export type GitInfo = { branch: string; ahead: number; behind: number; dirty: number; subject: string }

export const MAX_TODOS = 5

// Parses `git status --porcelain=v2 --branch` output.
export function parseStatus(out: string): Omit<GitInfo, 'subject'> {
  let branch = ''
  let ahead = 0
  let behind = 0
  let dirty = 0
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice(14).trim()
    else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) {
        ahead = Number(m[1])
        behind = Number(m[2])
      }
    } else if (line !== '' && !line.startsWith('#')) dirty++
  }
  return { branch, ahead, behind, dirty }
}

// First 5 unchecked items under a `## Next` heading, else the first 5 anywhere.
export function nextTodos(text: string): string[] {
  const all: string[] = []
  const next: string[] = []
  let inNext = false
  for (const line of text.split('\n')) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) inNext = /^next\b/i.test(heading[1]?.trim() ?? '')
    const item = /^\s*[-*]\s+\[ \]\s+(.*\S)\s*$/.exec(line)
    if (item?.[1]) {
      all.push(item[1])
      if (inNext) next.push(item[1])
    }
  }
  return (next.length > 0 ? next : all).slice(0, MAX_TODOS)
}

export function formatContext(git: GitInfo | null, todos: readonly string[]): string | null {
  const lines: string[] = []
  if (git) {
    const sync = [git.ahead > 0 ? `ahead ${git.ahead}` : '', git.behind > 0 ? `behind ${git.behind}` : '']
      .filter(Boolean)
      .join(', ')
    lines.push(`Git branch: ${git.branch}${sync ? ` (${sync})` : ''}`)
    lines.push(`Uncommitted files: ${git.dirty}`)
    if (git.subject) lines.push(`Last commit: ${git.subject}`)
  }
  if (todos.length > 0) lines.push('Next TODOS:', ...todos.map(t => `- [ ] ${t}`))
  if (lines.length === 0) return null

  return ['Session context (auto-context, as of the last turn):', ...lines].join('\n')
}
