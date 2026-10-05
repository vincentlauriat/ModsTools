import { expect, test } from 'claude-code/testing'

const CLAUDE = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

test('the tool receives the commit without the Claude trailer', async ($, on) => {
  const seen: string[] = []
  on('tool.call', ($e, e) => {
    if (e.tool === 'Bash') seen.push(e.command)
    return { result: 'ok' as never }
  })

  await $.tool.call({ tool: 'Bash', command: `git commit -m "fix: x\n\n${CLAUDE}"` })
  expect(seen).toEqual(['git commit -m "fix: x"'])
})

test('other commands reach the tool unchanged', async ($, on) => {
  const seen: string[] = []
  on('tool.call', ($e, e) => {
    if (e.tool === 'Bash') seen.push(e.command)
    return { result: 'ok' as never }
  })

  await $.tool.call({ tool: 'Bash', command: `echo "${CLAUDE}"` })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "fix: x"' })
  expect(seen).toEqual([`echo "${CLAUDE}"`, 'git commit -m "fix: x"'])
})
