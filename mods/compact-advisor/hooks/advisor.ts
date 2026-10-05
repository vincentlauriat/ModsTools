// Pure logic: when to toast, what to remember, and the suggested /compact line.
import type { AdvisorState } from '../types'

export const DEFAULT_THRESHOLD = 85
export const REARM_GAP = 10
export const MAX_FILES = 10
export const MAX_TODOS = 3
const KEEP_FILES = 50

export const EMPTY: AdvisorState = { armed: true, files: [], goal: '' }

// One toast per crossing: fires when armed and at or above the threshold, then re-arms below threshold - 10.
export function step(armed: boolean, percent: number | undefined, threshold: number): { armed: boolean; toast: boolean } {
  if (percent === undefined) return { armed, toast: false }
  if (armed && percent >= threshold) return { armed: false, toast: true }
  if (!armed && percent < threshold - REARM_GAP) return { armed: true, toast: false }

  return { armed, toast: false }
}

export const toastText = (percent: number): string =>
  `Context ${Math.round(percent)}% — /compact-advisor for a suggested /compact`

export const firstLine = (text: string): string =>
  text
    .split('\n')
    .map(l => l.trim())
    .find(l => l !== '') ?? ''

// A prompt the user typed (terminal, remote bridge or SDK host), not a slash command.
export function isUserGoal(origin: string, text: string): boolean {
  const line = firstLine(text)
  return (origin === 'composer' || origin === 'bridge' || origin === 'sdk') && line !== '' && !line.startsWith('/')
}

// Most recent last, each path once.
export const touch = (files: readonly string[], path: string): string[] =>
  [...files.filter(f => f !== path), path].slice(-KEEP_FILES)

export const relative = (path: string, cwd: string): string => {
  const root = cwd.replace(/\/$/, '')
  return path.startsWith(root + '/') ? path.slice(root.length + 1) : path
}

// The first open `- [ ]` items of a TODOS.md.
export function openTodos(markdown: string, max = MAX_TODOS): string[] {
  const items: string[] = []
  for (const line of markdown.split('\n')) {
    const m = /^\s*[-*+]\s+\[ \]\s+(.+)$/.exec(line)
    if (m !== null) items.push((m[1] ?? '').trim())
    if (items.length >= max) break
  }

  return items
}

const clean = (s: string) => s.replace(/;/g, ',').replace(/\s+/g, ' ').trim()

export type Facts = { branch: string | null; files: readonly string[]; todos: readonly string[]; goal: string }

// "/compact Keep: branch b; files edited: …; open tasks: …; last decision/goal: …", omitting what is unknown.
export function compactLine(facts: Facts): string {
  const parts: string[] = []
  if (facts.branch !== null && facts.branch !== '') parts.push(`branch ${facts.branch}`)
  const files = facts.files.slice(-MAX_FILES)
  if (files.length > 0) parts.push(`files edited: ${files.join(', ')}`)
  if (facts.todos.length > 0) parts.push(`open tasks: ${facts.todos.map(clean).join(' | ')}`)
  if (facts.goal !== '') parts.push(`last decision/goal: ${clean(facts.goal)}`)

  return parts.length === 0 ? '/compact' : `/compact Keep: ${parts.join('; ')}`
}
