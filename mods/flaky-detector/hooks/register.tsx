import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FlakyState } from '../types'
import { EMPTY, flakyList, isTestCommand, record, row } from './flaky'
import type { Ev } from './flaky'

const PANE = 'flaky-detector'
const TITLE = 'Flaky tests'
const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit']
const history = atom({ plugin: 'flaky-detector', key: 'history' } as const, EMPTY)

async function track($: EngineInterface, ev: Ev): Promise<void> {
  let flaky: string | null = null
  await update($, history, (s: FlakyState) => {
    const out = record(s, ev)
    flaky = out.newlyFlaky
    return out.state
  })
  if (flaky !== null) $.ui.toast(`flaky-detector: \`${flaky}\` failed then passed with no code change`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'flaky', description: 'Show tests that failed then passed with no code change (open | close | clear)' })

    return next(e)
  })

  on('command.run', { command: 'flaky' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'close' || arg === 'off') {
      await $.ui.close({ id: PANE })
      return { text: 'Flaky tests pane closed.' }
    }
    if (arg === 'clear') {
      await update($, history, () => EMPTY)
      return { text: 'Flaky history cleared.' }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    const count = flakyList(await read($, history)).length

    return { text: `Flaky tests pane opened (${count} flaky).` }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    if (EDIT_TOOLS.includes(e.tool)) {
      if (ran.isError !== true) await track($, { kind: 'edit' })
    } else if (e.tool === 'Bash' && isTestCommand(e.command)) {
      await track($, { kind: 'test', cmd: e.command, ok: ran.isError !== true, at: await $.clock.now() })
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = flakyList(await read($, history))
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)

    return (
      <Box flexDirection="column">
        <Text bold>{list.length} flaky</Text>
        {list.length === 0 && <Text dimColor>No flaky tests detected.</Text>}
        {list.slice(0, room).map(({ cmd, rec }) => (
          <Text>{row(cmd, rec, e.props.bodyColumns)}</Text>
        ))}
      </Box>
    )
  })
}
