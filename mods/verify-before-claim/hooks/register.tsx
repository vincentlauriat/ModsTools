import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LastTurn } from '../types'
import { findClaim, isCheckCommand, isCodePath } from './verify'

const MESSAGE = 'verify-before-claim: success claimed without running a build or test this turn'
const isWarning = atom({ plugin: 'verify-before-claim', key: 'isWarning' } as const, false)
const last = atom({ plugin: 'verify-before-claim', key: 'last' } as const, null)

const yesNo = (value: boolean) => (value ? 'yes' : 'no')

export const register: Register = on => {
  let isEnabled = true
  let codeChanged = false
  let checks = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'verify-before-claim',
      description: 'Warn when success is claimed without a check (off | on | status)',
    })

    return next(e)
  })

  on('command.run', { command: 'verify-before-claim' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off') {
      isEnabled = false
      await update($, isWarning, () => false)
      return { text: 'verify-before-claim is off.' }
    }
    if (arg === 'on') {
      isEnabled = true
      return { text: 'verify-before-claim is on.' }
    }
    const turn: LastTurn | null = await read($, last)
    const state = isEnabled ? 'on' : 'off'
    if (turn === null) return { text: `verify-before-claim is ${state}. No turn completed yet.` }

    return {
      text: `verify-before-claim is ${state}. Last turn: code changed: ${yesNo(turn.codeChanged)}, checks run: ${turn.checks}, claim found: ${turn.claim === null ? 'no' : `yes ("${turn.claim}")`}.`,
    }
  })

  on('prompt.submit', ($, e, next) => {
    codeChanged = false
    checks = 0

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined) return ran
    if (e.tool === 'Bash' && isCheckCommand(e.command)) checks += 1
    if (ran.isError === true) return ran
    const path = e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : e.tool === 'NotebookEdit' ? e.notebook_path : undefined
    if (path !== undefined && isCodePath(path)) codeChanged = true

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined || e.isAborted || !isEnabled) return next(e)
    const claim = findClaim(e.answer)
    await update($, last, () => ({ codeChanged, checks, claim }))
    if (checks > 0) await update($, isWarning, () => false)
    else if (codeChanged && claim !== null) {
      await update($, isWarning, () => true)
      $.ui.toast(MESSAGE)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, isWarning)) || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color="yellow">⚠ {MESSAGE} </Text>
        <Button key="dismiss" label="Dismiss" onPress={() => update($, isWarning, () => false)} />
      </Box>
    )
  })
}
