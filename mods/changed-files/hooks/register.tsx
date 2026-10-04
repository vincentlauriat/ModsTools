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

// Above this many dirty paths, a snapshot is skipped rather than hashing them all.
const SNAPSHOT_LIMIT = 2000

const split = (stdout: string) => stdout.split('\0').filter(Boolean)

// The repo's dirty, untracked and deleted files, absolute path → content hash
// ('deleted' for a removed file); null outside a git repository.
async function snapshot($: EngineInterface): Promise<Map<string, string> | null> {
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'])
  if (top.exitCode !== 0) return null
  const root = top.stdout.trim()
  const listed = await $.process.run(
    ['git', 'ls-files', '-z', '-m', '-o', '-d', '--exclude-standard'],
    { cwd: root },
  )
  const gone = await $.process.run(['git', 'ls-files', '-z', '-d'], { cwd: root })
  if (listed.exitCode !== 0 || gone.exitCode !== 0) return null
  const deleted = new Set(split(gone.stdout))
  const present = [...new Set(split(listed.stdout))].filter(path => !deleted.has(path))
  if (present.length + deleted.size > SNAPSHOT_LIMIT) return null

  const files = new Map<string, string>()
  for (const path of deleted) files.set(`${root}/${path}`, 'deleted')
  if (present.length === 0) return files
  const absolute = present.map(path => `${root}/${path}`)
  const hashed = await $.process.run(['git', 'hash-object', '--', ...absolute], { cwd: root })
  if (hashed.exitCode !== 0) return null
  const hashes = hashed.stdout.trim().split('\n')
  absolute.forEach((path, i) => files.set(path, hashes[i] ?? ''))

  return files
}

const changedBetween = (before: Map<string, string>, after: Map<string, string>) => [
  ...[...after].filter(([path, hash]) => before.get(path) !== hash).map(([path]) => path),
  ...[...before.keys()].filter(path => !after.has(path)),
]

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

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const before = await snapshot($)
    const ran = await next(e)
    if (before === null || ran.deny !== undefined) return ran
    const after = await snapshot($)
    if (after === null) return ran
    for (const path of changedBetween(before, after)) await record($, path, 'Bash')

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
