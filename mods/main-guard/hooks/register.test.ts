import { expect, test } from 'claude-code/testing'
import type { ProcessRunResult } from 'claude-code'

const git = (stdout: string): ProcessRunResult => ({
  exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
})

test('a push to main is denied and never reaches the tool', async ($, on) => {
  let ran = 0
  on('process.run', () => ({ value: git('feat/x\n') }))
  on('tool.call', () => {
    ran += 1
    return { result: 'ok' as never }
  })

  const denied = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(ran).toBe(0)
  expect('deny' in denied ? denied.deny : denied.text).toContain('main-guard')

  await $.tool.call({ tool: 'Bash', command: 'git push origin feat/x' })
  expect(ran).toBe(1)
})

test('a bare push is denied when the current branch is main', async ($, on) => {
  let ran = 0
  on('process.run', () => ({ value: git('main\n') }))
  on('tool.call', () => {
    ran += 1
    return { result: 'ok' as never }
  })

  await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(ran).toBe(0)
})

test('/main-guard off lets the push through, /main-guard on blocks it again', async ($, on) => {
  let ran = 0
  on('process.run', () => ({ value: git('feat/x\n') }))
  on('tool.call', () => {
    ran += 1
    return { result: 'ok' as never }
  })

  await $.command.run({ command: 'main-guard', args: 'off' } as never)
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(ran).toBe(1)

  await $.command.run({ command: 'main-guard', args: 'on' } as never)
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(ran).toBe(1)
})
