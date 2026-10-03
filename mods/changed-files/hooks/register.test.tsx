import { expect, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'changed-files',
  props: { title: 'Changed files', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
} as const

test('successful edits are listed once, relative to the session cwd, with a count', async ($, on) => {
  on('session.cwd', () => ({ value: '/proj' }))
  on('tool.call', $e => ({ result: 'ok' as never }))

  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Write', file_path: '/elsewhere/b.md', content: 'x' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'changed-files', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: '2 files changed' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'src/a.ts ×2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '/elsewhere/b.md ×1' })).toBeDefined()
    await ui.unmount()
  }
})

test('failed or refused edits are not listed', async ($, on) => {
  on('session.cwd', () => ({ value: '/proj' }))
  on('tool.call', () => ({ deny: 'no' }))

  await $.tool.call({ tool: 'Edit', file_path: '/proj/a.ts', old_string: 'a', new_string: 'b' })

  const ui = await $.ui.mount({ plugin: 'changed-files', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '0 files changed' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Nothing modified yet.' })).toBeDefined()
  await ui.unmount()
})
