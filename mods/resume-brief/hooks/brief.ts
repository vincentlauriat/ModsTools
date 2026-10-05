export type Sources = { commands?: string | null; memory?: string | null; plan?: string | null; changes?: string | null }

const MAX_LINES = 30

function lines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

export function truncate(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())

  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('')
}

export function lastCommands(text: string, count = 3): string[] {
  const entries: { head: string; body: string[] }[] = []
  for (const line of lines(text)) {
    const m = /^##\s+(\d+)\s*[—–-]\s*(\S.*)$/.exec(line)
    if (m) entries.push({ head: `#${m[1]} ${m[2]?.trim()}`, body: [] })
    else entries[entries.length - 1]?.body.push(line)
  }

  return entries
    .slice(-count)
    .map(e => `${e.head}: ${truncate(e.body.join(' '), 200)}`)
}

export function stateBullets(text: string, count = 4): string[] {
  const bullets: string[] = []
  let inState = false
  for (const line of lines(text)) {
    if (/^##\s/.test(line)) inState = /^##\s+State\s*$/i.test(line)
    else if (inState && /^[-*]\s+\S/.test(line)) bullets.push(line.replace(/^[-*]\s+/, ''))
    else if (inState && bullets.length > 0 && /^\s+\S/.test(line)) bullets[bullets.length - 1] += ` ${line.trim()}`
  }

  return bullets.slice(-count).map(b => `- ${truncate(b, 300)}`)
}

export function inProgress(text: string, max = 8): string[] {
  const out: string[] = []
  let active = false
  for (const line of lines(text)) {
    if (/^##\s/.test(line)) {
      active = /^##\s+Phase\b/.test(line) && line.includes('🟡')
      if (active) out.push(truncate(line.replace(/^##\s+/, ''), 160))
    } else if (active && /^\s*[-*]\s+(🟡|⬜)/.test(line)) out.push(`  ${truncate(line.replace(/^\s*[-*]\s+/, '- '), 160)}`)
  }

  return out.slice(0, max)
}

export function lastLines(text: string, count = 5): string[] {
  return lines(text)
    .filter(l => l.trim() !== '')
    .slice(-count)
    .map(l => truncate(l, 200))
}

function section(title: string, body: string[]): string[] {
  return body.length > 0 ? [`${title}:`, ...body] : []
}

export function buildBrief(src: Sources): string | null {
  const parts = [
    ...section('Last user messages (COMMANDS.md)', lastCommands(src.commands ?? '')),
    ...section('Project state (MEMORY.md)', stateBullets(src.memory ?? '')),
    ...section('In progress (PLAN.md)', inProgress(src.plan ?? '')),
    ...section('Recent changes (CHANGES.md)', lastLines(src.changes ?? '')),
  ]
  if (parts.length === 0) return null

  return ['Where we left off (from the project journals):', ...parts].slice(0, MAX_LINES).join('\n')
}
