import { expect, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'tool-heatmap',
  props: { title: 'Tool heatmap', isFocused: false, bodyColumns: 40, placement: 'dock' } as never,
} as const

test('counts calls and failures per tool, main and subagents, most called first', async ($, on) => {
  on('tool.call', ($e, e) => {
    if (e.tool === 'Write') return { deny: 'no' }
    if (e.tool === 'Edit') return { isError: true, result: undefined, text: 'boom' } as never
    return { result: 'ok' as never }
  })

  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'sub-1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/a', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/a', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Write', file_path: '/b', content: 'x' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'tool-heatmap', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: '7 calls · 3 failed · 3 tools' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Bash +█+ +4$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Edit +█+ +2 \(2✗\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Write +█+ +1 \(1✗\)$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('an empty session says so', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' as never }))

  const ui = await $.ui.mount({ plugin: 'tool-heatmap', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '0 calls · 0 failed · 0 tools' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'No tool calls yet.' })).toBeDefined()
  await ui.unmount()
})

test('/tool-heatmap opens the pane and reports the total', async ($, on) => {
  const opened: string[] = []
  on('tool.call', () => ({ result: 'ok' as never }))
  on('ui.open', ($e, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const ran = await $.command.run({ command: 'tool-heatmap', args: '' } as never)
  expect('text' in ran ? ran.text : '').toContain('1 call · 0 failed · 1 tool')
  expect(opened).toEqual(['tool-heatmap'])
})
