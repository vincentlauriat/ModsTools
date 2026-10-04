import { describe, expect, test } from 'claude-code/testing'

import type { HeatmapTool } from '../types'
import { count, rows, sorted, total } from './heat'

const list: HeatmapTool[] = [
  { tool: 'Read', calls: 3, failures: 0 },
  { tool: 'Bash', calls: 10, failures: 2 },
  { tool: 'Edit', calls: 3, failures: 1 },
]

describe('heat', () => {
  test('count adds a call and a failure per tool', () => {
    let tally: HeatmapTool[] = []
    tally = count(tally, 'Bash', false)
    tally = count(tally, 'Bash', true)
    tally = count(tally, 'Read', false)
    expect(sorted(tally)).toEqual([
      { tool: 'Bash', calls: 2, failures: 1 },
      { tool: 'Read', calls: 1, failures: 0 },
    ])
  })

  test('sorts by count descending, then by name', () => {
    expect(sorted(list).map(one => one.tool)).toEqual(['Bash', 'Edit', 'Read'])
  })

  test('total sums calls, failures and tools', () => {
    expect(total(list)).toBe('16 calls · 3 failed · 3 tools')
    expect(total([{ tool: 'Bash', calls: 1, failures: 0 }])).toBe('1 call · 0 failed · 1 tool')
  })

  test('bars scale to the top tool within the columns', () => {
    const lines = rows(list, 30)
    expect(lines[0]).toMatch(/^Bash █+ 10 \(2✗\)$/)
    expect(lines[1]).toMatch(/^Edit █+ +3 \(1✗\)$/)
    expect(lines[2]).toMatch(/^Read █+ +3$/)
    const bar = (line: string) => (line.match(/█+/)?.[0] ?? '').length
    expect(bar(lines[0]!)).toBe(30 - 4 - '10 (2✗)'.length - 2)
    expect(bar(lines[1]!)).toBeLessThan(bar(lines[0]!))
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(30)
  })

  test('long tool names are cut', () => {
    const [line] = rows([{ tool: 'mcp__plugin_server__a_very_long_tool', calls: 1, failures: 0 }], 40)
    expect(line).toMatch(/^mcp__plugin_server_… █+ 1$/)
  })
})
