import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChangedFile } from '../types'

const PANE = 'changed-files'
const TITLE = 'Changed files'
const files = atom({ plugin: 'changed-files', key: 'files' } as const, [])

const relative = (path: string, cwd: string) =>
  path.startsWith(cwd + '/') ? path.slice(cwd.length + 1) : path

async function record($: EngineInterface, path: string, tool: string) {
  const cwd = await $.session.cwd()
  const shown = relative(path, cwd)
  await update($, files, list => {
    const found = list.find(one => one.path === shown)
    const rest = list.filter(one => one.path !== shown)
    const edits = (found?.edits ?? 0) + 1

    return [...rest, { path: shown, tool, edits }]
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'changed-files',
      description: 'Show the files modified in this session',
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'changed-files' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    const count = (await read($, files)).length

    return { text: `Changed files pane opened (${count} file${count === 1 ? '' : 's'}).` }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await record($, e.file_path, 'Edit')

    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await record($, e.file_path, 'Write')

    return ran
  })

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await record($, e.notebook_path, 'NotebookEdit')

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list: ChangedFile[] = await read($, files)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)

    return (
      <Box flexDirection="column">
        <Text bold>
          {list.length} file{list.length === 1 ? '' : 's'} changed
        </Text>
        {list.length === 0 && <Text dimColor>Nothing modified yet.</Text>}
        {list
          .slice(-room)
          .reverse()
          .map(file => (
            <Text key={`file:${file.path}`}>
              {file.path}
              <Text dimColor> ×{file.edits}</Text>
            </Text>
          ))}
      </Box>
    )
  })
}
