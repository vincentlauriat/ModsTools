import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pending } from '../types'
import { DOCS, bandLabel, instruction, isJeCoupe, staleDocs } from './ritual'
import type { DocStat } from './ritual'

const pending = atom({ plugin: 'je-coupe', key: 'pending' } as const, null)

async function scan($: EngineInterface): Promise<DocStat[]> {
  const cwd = await $.session.cwd()
  const found: DocStat[] = []
  for (const name of DOCS) {
    try {
      const stat = await $.fs.stat(`${cwd}/${name}`)
      if (stat.kind === 'file') found.push({ name, mtimeMs: stat.mtimeMs })
    } catch {
      // missing doc: not part of this folder's ritual
    }
  }

  return found
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (!isJeCoupe(e.text)) return next(e)
    const docs = await scan($)
    if (docs.length === 0) return next(e)
    const { startedAt } = await $.session.usage()
    await update($, pending, () => ({ stale: staleDocs(docs, startedAt) }) satisfies Pending)

    return next({ ...e, text: `${e.text}\n\n${instruction(docs, startedAt)}` })
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, pending)) !== null) {
      const { startedAt } = await $.session.usage()
      const stale = staleDocs(await scan($), startedAt)
      await update($, pending, () => (stale.length === 0 ? null : { stale }))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, pending)
    if (e.props.hasSurvey || state === null) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text>{bandLabel(state.stale)}</Text>
        <Button key="dismiss" label="Dismiss" onPress={() => update($, pending, () => null)} />
      </Box>
    )
  })
}
