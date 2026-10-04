import { expect, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'network-log',
  props: { title: 'Network', isFocused: false, bodyColumns: 70, placement: 'dock' } as never,
} as const

test('logs network calls newest first, skips others, marks subagents and denials', async ($, on) => {
  let ran = 0
  on('tool.call', (_$, e) => {
    ran++
    const input = e as { command?: string }
    if (input.command === 'git push') return { deny: 'blocked' }
    if (input.command === 'curl https://bad.io') return { isError: true, result: undefined, text: 'Exit code 6' } as never
    return { result: 'ok' as never }
  })

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'WebFetch', url: 'https://docs.a.org/x', prompt: 'p' } as never)
  await $.tool.call({ tool: 'Bash', command: 'curl https://bad.io' })
  await $.tool.call({ tool: 'WebSearch', query: 'swift 6', mode: 'standard' } as never)
  await $.tool.call({ tool: 'mcp__linear__list', agentId: 'sub-1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(ran).toBe(6)

  const ui = await $.ui.mount({ plugin: 'network-log', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '5 requests · 3 hosts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'denied bash git push' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✗ bash curl https://bad.io' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✓ search swift 6' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '↳ ✓ mcp linear › list' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✓ web https://docs.a.org/x' })).toBeDefined()
  await ui.unmount()
})

test('/network-log opens, clears and closes', async ($, on) => {
  const calls: string[] = []
  on('tool.call', () => ({ result: 'ok' as never }))
  on('ui.open', (_$, e) => {
    calls.push(`open:${e.id}`)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    calls.push(`close:${e.id}`)
    return { value: undefined } as never
  })

  await $.tool.call({ tool: 'Bash', command: 'wget https://a.io/f' })
  const opened = await $.command.run({ command: 'network-log', args: '' } as never)
  expect('text' in opened ? opened.text : '').toContain('1 request · 1 host')
  const cleared = await $.command.run({ command: 'network-log', args: 'clear' } as never)
  expect('text' in cleared ? cleared.text : '').toContain('cleared')
  const again = await $.command.run({ command: 'network-log', args: '' } as never)
  expect('text' in again ? again.text : '').toContain('0 requests')
  await $.command.run({ command: 'network-log', args: 'close' } as never)
  expect(calls).toEqual(['open:network-log', 'open:network-log', 'close:network-log'])
})
