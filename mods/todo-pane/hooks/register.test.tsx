import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'todo-pane',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'todo-pane',
  props: { title: 'TODOS', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
} as const

const TODOS = '# Todos\n## Now\n- [ ] write tests\n- [x] ship band\nprose\n## Later\n- [ ] release\n'

// A folder /proj whose TODOS.md is `disk.text` (absent when null); every write is logged.
function world(on: On, text: string | null) {
  const disk = { text, writes: [] as { path: string; text: string }[] }
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.read', ($, e) => {
    if (e.path !== '/proj/TODOS.md' || disk.text === null) throw new Error('ENOENT')
    return { value: disk.text }
  })
  on('fs.write', ($, e) => {
    disk.writes.push({ path: e.path, text: e.text })
    disk.text = e.text
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('tool.call', () => ({ result: 'ok' as never }))
  return disk
}

test('renders headings as text and checkboxes as buttons', async ($, on) => {
  world(on, TODOS)
  await $.command.run({ command: 'todos', args: '' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'Now' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Later' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'todo:2', text: '☐ write tests' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'todo:3', text: '☑ ship band' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'todo:6', text: '☐ release' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'todo:2', text: '☑ write tests' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /prose/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('pressing a box toggles that line in the file and refreshes', async ($, on) => {
  const disk = world(on, TODOS)
  await $.command.run({ command: 'todos', args: '' } as never)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'todo:2' })
  expect(disk.writes).toEqual([{ path: '/proj/TODOS.md', text: TODOS.replace('- [ ] write tests', '- [x] write tests') }])
  expect(await ui.find({ type: 'Button', key: 'todo:2', text: '☑ write tests' })).toBeDefined()
  await ui.unmount()
})

test('a press re-reads the file and writes nothing when the line changed meanwhile', async ($, on) => {
  const disk = world(on, TODOS)
  await $.command.run({ command: 'todos', args: '' } as never)

  const ui = await $.ui.mount(PANE)
  disk.text = '## Now\n- [ ] new first item\n- [ ] other\n- [ ] write tests\n'
  await ui.press({ key: 'todo:2' })
  expect(disk.writes).toEqual([])
  expect(await ui.find({ type: 'Button', key: 'todo:1', text: '☐ new first item' })).toBeDefined()
  await ui.unmount()
})

test('an Edit of TODOS.md refreshes the pane; an Edit elsewhere does not', async ($, on) => {
  const disk = world(on, TODOS)
  await $.command.run({ command: 'todos', args: '' } as never)

  disk.text = '## Now\n- [x] write tests\n'
  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'a', new_string: 'b' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'Later' })).toBeDefined()
  await ui.unmount()

  await $.tool.call({ tool: 'Edit', file_path: '/proj/TODOS.md', old_string: 'a', new_string: 'b' })
  const after = await $.ui.mount(PANE)
  expect(await after.find({ type: 'Text', text: 'Later' })).toBeUndefined()
  expect(await after.find({ type: 'Button', key: 'todo:1', text: '☑ write tests' })).toBeDefined()
  await after.unmount()
})

test('a Bash command mentioning TODOS.md refreshes the pane', async ($, on) => {
  const disk = world(on, null)
  await $.command.run({ command: 'todos', args: '' } as never)
  disk.text = '## Now\n- [ ] x\n'
  await $.tool.call({ tool: 'Bash', command: 'echo "## Now" > TODOS.md' })

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Button', key: 'todo:1', text: '☐ x' })).toBeDefined()
  await ui.unmount()
})

test('without TODOS.md the pane says so', async ($, on) => {
  world(on, null)
  const ran = await $.command.run({ command: 'todos', args: '' } as never)
  expect((ran as { text: string }).text).toBe('No TODOS.md in this folder.')

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: 'No TODOS.md in this folder.' })).toBeDefined()
  await ui.unmount()
})
