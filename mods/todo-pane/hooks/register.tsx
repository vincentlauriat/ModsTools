import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { parse, toggle } from './todos'

const PANE = 'todo-pane'
const TITLE = 'TODOS'
const FILE = 'TODOS.md'
const items = atom({ plugin: 'todo-pane', key: 'items' } as const, null)

async function path($: EngineInterface) {
  return `${await $.session.cwd()}/${FILE}`
}

async function load($: EngineInterface): Promise<string | null> {
  try {
    return await $.fs.read(await path($))
  } catch {
    return null
  }
}

async function reload($: EngineInterface) {
  const text = await load($)
  await update($, items, () => (text === null ? null : parse(text)))
}

async function toggleLine($: EngineInterface, index: number, expected: string) {
  const text = await load($)
  const toggled = text === null ? null : toggle(text, index, expected)
  if (toggled !== null) await $.fs.write(await path($), toggled)
  await reload($)
}

const succeeded = (ran: { deny?: string; isError?: boolean }) => ran.deny === undefined && ran.isError !== true

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'todos', description: `Show the checkboxes of ${FILE} in a pane` })
    void $.ui.open({ id: PANE, title: TITLE })
    await reload($)

    return next(e)
  })

  on('command.run', { command: 'todos' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    await reload($)
    const list = await read($, items)

    return { text: list === null ? `No ${FILE} in this folder.` : `TODOS pane opened.` }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (succeeded(ran) && e.file_path.endsWith(FILE)) await reload($)

    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (succeeded(ran) && e.file_path.endsWith(FILE)) await reload($)

    return ran
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && e.command.includes(FILE)) await reload($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, items)
    if (list === null) return <Text dimColor>{`No ${FILE} in this folder.`}</Text>

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No checkboxes yet.</Text>}
        {list.map(item =>
          item.kind === 'heading' ? (
            <Text bold>{item.text}</Text>
          ) : (
            <Button
              key={`todo:${item.index}`}
              label={`${item.done ? '☑' : '☐'} ${item.text}`}
              onPress={() => toggleLine($, item.index, item.text)}
            />
          ),
        )}
      </Box>
    )
  })
}
