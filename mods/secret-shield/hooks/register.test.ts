import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Split so this file itself holds no secret-looking literal.
const SECRET = ['sk-', 'ant-api03-', 'a8Fk2Lq9Zt4Xw7Nc3Vb6Hm1Pr5Sd0Gy'].join('')

function countRuns(on: On): { ran: number } {
  const count = { ran: 0 }
  on('tool.call', () => {
    count.ran += 1
    return { result: 'ok' as never }
  })

  return count
}

const denial = (r: object) => ('deny' in r ? String(r.deny) : '')

test('Write with a secret is denied without leaking it', async ($, on) => {
  const count = countRuns(on)
  const r = await $.tool.call({ tool: 'Write', file_path: '/p/.env', content: `KEY=${SECRET}\n` } as never)
  expect(count.ran).toBe(0)
  expect(denial(r)).toContain('Anthropic API key')
  expect(denial(r)).toContain('sk-a****')
  expect(denial(r)).not.toContain(SECRET)
})

test('Edit with a secret in new_string is denied', async ($, on) => {
  const count = countRuns(on)
  const r = await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'x', new_string: `const k = "${SECRET}"` } as never)
  expect(count.ran).toBe(0)
  expect(denial(r)).toContain('secret-shield')
})

test('Bash with a secret is denied', async ($, on) => {
  const count = countRuns(on)
  const r = await $.tool.call({ tool: 'Bash', command: `curl -H "x-api-key: ${SECRET}" https://api.example.com` })
  expect(count.ran).toBe(0)
  expect(denial(r)).toContain('secret-shield')
})

test('clean content reaches the tools', async ($, on) => {
  const count = countRuns(on)
  await $.tool.call({ tool: 'Write', file_path: '/p/.env.example', content: 'KEY=sk-xxxx\n' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'x', new_string: 'const k = process.env.KEY' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(count.ran).toBe(3)
})

test('/secret-shield off lets it through, on blocks it again', async ($, on) => {
  const count = countRuns(on)
  const off = await $.command.run({ command: 'secret-shield', args: 'off' } as never)
  expect(off.text).toContain('OFF')
  await $.tool.call({ tool: 'Bash', command: `echo ${SECRET}` })
  expect(count.ran).toBe(1)

  await $.command.run({ command: 'secret-shield', args: 'on' } as never)
  await $.tool.call({ tool: 'Bash', command: `echo ${SECRET}` })
  expect(count.ran).toBe(1)
  const status = await $.command.run({ command: 'secret-shield', args: 'status' } as never)
  expect(status.text).toContain('ON')
})
