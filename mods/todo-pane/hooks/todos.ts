import type { TodoItem } from '../types'

const HEADING = /^##\s+(.*?)\s*$/
const CHECKBOX = /^(\s*[-*] \[)([ xX])(\]\s+)(.*?)\s*$/

const strip = (line: string) => line.replace(/\r$/, '')

export function parse(text: string): TodoItem[] {
  const items: TodoItem[] = []
  text.split('\n').forEach((raw, index) => {
    const line = strip(raw)
    const heading = HEADING.exec(line)
    if (heading) return void items.push({ index, kind: 'heading', text: heading[1] ?? '', done: false })
    const box = CHECKBOX.exec(line)
    if (box) items.push({ index, kind: 'todo', text: box[4] ?? '', done: box[2] !== ' ' })
  })

  return items
}

// The file with line `index` toggled, or null when that line is no longer the checkbox `expected`.
export function toggle(text: string, index: number, expected: string): string | null {
  const lines = text.split('\n')
  const raw = lines[index]
  if (raw === undefined) return null
  const box = CHECKBOX.exec(strip(raw))
  if (!box || box[4] !== expected) return null
  const mark = box[2] === ' ' ? 'x' : ' '
  const prefix = box[1] ?? ''
  lines[index] = prefix + mark + raw.slice(prefix.length + 1)

  return lines.join('\n')
}
