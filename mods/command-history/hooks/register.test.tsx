import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'command-history',
  props: { title: 'Commands', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
} as const

test('lists commands most recent first with status and duration', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  on('tool.call', async ($e, e) => {
    const cmd = (e as { command: string }).command
    if (cmd === 'rm -rf x') return { deny: 'blocked' }
    await clock.advance(cmd === 'sleep 2' ? 2000 : 10)
    if (cmd === 'false') return { isError: true, result: undefined, text: 'Exit code 1' } as never
    return { result: { stdout: '', stderr: '', interrupted: false } as never }
  })

  await $.tool.call({ tool: 'Bash', command: 'sleep 2' })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.tool.call({ tool: 'Bash', command: 'rm -rf x' })

  const ui = await $.ui.mount({ plugin: 'command-history', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '3 commands' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'denied rm -rf x · 0ms' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✗ 1 false · 10ms' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✓ sleep 2 · 2.0s' })).toBeDefined()
  await ui.unmount()
})

test('subagent Bash calls are not recorded', async ($, on) => {
  mock.clock(on, { now: 0 })
  on('tool.call', () => ({ result: 'ok' as never }))

  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'sub-1' } as never)

  const ui = await $.ui.mount({ plugin: 'command-history', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '0 commands' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'No Bash commands yet.' })).toBeDefined()
  await ui.unmount()
})

test('/command-history opens the pane, clear empties it, close closes it', async ($, on) => {
  const calls: string[] = []
  mock.clock(on, { now: 0 })
  on('tool.call', () => ({ result: 'ok' as never }))
  on('ui.open', ($e, e) => {
    calls.push(`open:${e.id}`)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($e, e) => {
    calls.push(`close:${e.id}`)
    return { value: undefined } as never
  })

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const opened = await $.command.run({ command: 'command-history', args: '' } as never)
  expect('text' in opened ? opened.text : '').toContain('1 command)')
  const cleared = await $.command.run({ command: 'command-history', args: 'clear' } as never)
  expect('text' in cleared ? cleared.text : '').toContain('cleared')
  const again = await $.command.run({ command: 'command-history', args: '' } as never)
  expect('text' in again ? again.text : '').toContain('0 commands')
  await $.command.run({ command: 'command-history', args: 'close' } as never)
  expect(calls).toEqual(['open:command-history', 'open:command-history', 'close:command-history'])
})
