import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { bandText, checkLanguages, languageOf } from './gate'

const missing = atom({ plugin: 'build-gate', key: 'missing' } as const, [])

export const register: Register = on => {
  let isEnabled = true
  let pending = new Set<string>()
  let last: { changed: string[]; unverified: string[] } | null = null
  let changedThisTurn = new Set<string>()
  let ranThisTurn = new Set<string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'build-gate',
      description: 'Band when code changed without a build (off | on | status)',
    })

    return next(e)
  })

  on('command.run', { command: 'build-gate' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off') {
      isEnabled = false
      await update($, missing, () => [])
      return { text: 'build-gate is off.' }
    }
    if (arg === 'on') {
      isEnabled = true
      return { text: 'build-gate is on.' }
    }
    const state = isEnabled ? 'on' : 'off'
    if (last === null) return { text: `build-gate is ${state}. No turn completed yet.` }
    const list = (items: string[]) => (items.length === 0 ? 'none' : items.join(', '))

    return { text: `build-gate is ${state}. Last turn: changed: ${list(last.changed)}; no matching build: ${list(last.unverified)}.` }
  })

  on('prompt.submit', ($, e, next) => {
    pending = new Set()
    changedThisTurn = new Set()
    ranThisTurn = new Set()

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined) return ran
    if (e.tool === 'Bash') {
      for (const language of checkLanguages(e.command)) {
        pending.delete(language)
        ranThisTurn.add(language)
      }
      return ran
    }
    if (ran.isError === true) return ran
    const path = e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : e.tool === 'NotebookEdit' ? e.notebook_path : undefined
    const language = path === undefined ? null : languageOf(path)
    if (language !== null) {
      pending.add(language)
      changedThisTurn.add(language)
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined || e.isAborted || !isEnabled) return next(e)
    const unverified = [...pending]
    last = { changed: [...changedThisTurn], unverified }
    await update($, missing, previous => [...new Set([...previous.filter(language => !ranThisTurn.has(language)), ...unverified])])

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const languages = await read($, missing)
    if (languages.length === 0 || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color="yellow">{bandText(languages)} </Text>
        <Button key="dismiss" label="Dismiss" onPress={() => update($, missing, () => [])} />
      </Box>
    )
  })
}
