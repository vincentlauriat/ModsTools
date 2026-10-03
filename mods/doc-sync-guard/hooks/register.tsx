import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MissingDocs } from '../types'

// The journal updated on every message, and the changelog updated on every real change.
const JOURNAL = 'COMMANDS.md'
const CHANGELOG = 'CHANGES.md'
// Above this many dirty files, the git check for code changed through Bash is skipped.
const DIRTY_LIMIT = 500

const missing = atom({ plugin: 'doc-sync-guard', key: 'missing' } as const, [])

const isCode = (path: string) => !path.endsWith('.md')

async function mtime($: EngineInterface, path: string): Promise<number | undefined> {
  const stat = await $.fs.stat(path).catch(() => undefined)

  return stat?.kind === 'file' ? stat.mtimeMs : undefined
}

// Whether a non-Markdown file the repo sees as modified or new was written since `since`.
async function codeChangedInGit($: EngineInterface, cwd: string, since: number): Promise<boolean> {
  const listed = await $.process.run(['git', 'ls-files', '-z', '-m', '-o', '--exclude-standard'], { cwd })
  if (listed.exitCode !== 0) return false
  const paths = listed.stdout.split('\0').filter(path => path !== '' && isCode(path))
  if (paths.length > DIRTY_LIMIT) return false
  for (const path of paths) {
    const changed = await mtime($, `${cwd}/${path}`)
    if (changed !== undefined && changed >= since) return true
  }

  return false
}

export const register: Register = on => {
  let startedAt = 0
  let isCodeEdited = false

  on('prompt.submit', async ($, e, next) => {
    startedAt = await $.clock.now()
    isCodeEdited = false
    await update($, missing, () => [])

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const path = e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : e.tool === 'NotebookEdit' ? e.notebook_path : undefined
    if (path !== undefined && isCode(path) && ran.deny === undefined && ran.isError !== true) isCodeEdited = true

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined || e.isAborted || startedAt === 0) return next(e)
    const cwd = await $.session.cwd()
    const journal = await mtime($, `${cwd}/${JOURNAL}`)
    const changelog = await mtime($, `${cwd}/${CHANGELOG}`)
    if (journal === undefined && changelog === undefined) return next(e)

    const late: MissingDocs = []
    if (journal !== undefined && journal < startedAt) late.push(JOURNAL)
    if (changelog !== undefined && changelog < startedAt) {
      const isCodeChanged = isCodeEdited || (await codeChangedInGit($, cwd, startedAt))
      if (isCodeChanged) late.push(CHANGELOG)
    }
    await update($, missing, () => late)
    if (late.length > 0) $.ui.toast(`Docs not updated: ${late.join(', ')}`)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const late = await read($, missing)
    if (late.length === 0 || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color="yellow">⚠ Not updated this turn: {late.join(', ')} </Text>
        <Button key="dismiss" label="Dismiss" onPress={() => update($, missing, () => [])} />
      </Box>
    )
  })
}
