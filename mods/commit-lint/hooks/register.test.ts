import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

let ran = 0

function world(on: On, files: Record<string, string> = {}) {
  ran = 0
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.read', (_$, e) => {
    const text = files[String((e as { path: string }).path)]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('tool.call', () => {
    ran += 1
    return { result: 'ok' as never }
  })
}

const run = ($: Engine, command: string) => $.tool.call({ tool: 'Bash', command })
const denied = (r: unknown) => 'deny' in (r as object)

test('a non-conventional message is refused with the expected format, a good one runs', async ($, on) => {
  world(on)

  const bad = await run($, 'git add . && git commit -m "Add thing"')
  expect(denied(bad)).toBe(true)
  expect(String((bad as { deny: string }).deny)).toContain('type(scope)?!?: subject')
  expect(String((bad as { deny: string }).deny)).toContain('feat')
  expect(ran).toBe(0)

  await run($, 'git commit -m "feat(ui): add pane"')
  await run($, `git commit -m "$(cat <<'EOF'\nfix: heredoc ok\n\nbody\nEOF\n)"`)
  expect(ran).toBe(2)
})

test('heredoc with a bad subject is refused', async ($, on) => {
  world(on)

  expect(denied(await run($, `rtk git commit -m "$(cat <<'EOF'\nupdated stuff\nEOF\n)"`))).toBe(true)
  expect(ran).toBe(0)
})

test('-F reads the file relative to the cwd; unreadable files are allowed', async ($, on) => {
  world(on, { '/proj/bad.txt': 'wip\n', '/proj/good.txt': 'feat: ok\n' })

  expect(denied(await run($, 'git commit -F bad.txt'))).toBe(true)
  await run($, 'git commit -F good.txt')
  await run($, 'git commit -F missing.txt')
  await run($, 'git commit -F -')
  expect(ran).toBe(3)
})

test('commands without a message, merges, fixups and non-commits pass', async ($, on) => {
  world(on)

  for (const c of ['git commit --amend --no-edit', 'git commit -C HEAD', 'git commit', 'git commit -m "Merge branch x"', 'git commit -m "fixup! feat: a"', 'git commit -m \'Revert "feat: a"\'', 'git status']) {
    await run($, c)
  }
  expect(ran).toBe(7)
})

test('maxHeader option sets the length limit', { options: { maxHeader: 20 } }, async ($, on) => {
  world(on)

  expect(denied(await run($, 'git commit -m "feat: this header is too long"'))).toBe(true)
  await run($, 'git commit -m "feat: short"')
  expect(ran).toBe(1)
})

test('/commit-lint off lets everything through, on refuses again', async ($, on) => {
  world(on)

  const off = await $.command.run({ command: 'commit-lint', args: 'off' } as never)
  expect('text' in off ? off.text : '').toContain('OFF')
  await run($, 'git commit -m "nope"')
  expect(ran).toBe(1)

  await $.command.run({ command: 'commit-lint', args: 'on' } as never)
  expect(denied(await run($, 'git commit -m "nope"'))).toBe(true)
  const status = await $.command.run({ command: 'commit-lint', args: 'status' } as never)
  expect('text' in status ? status.text : '').toContain('ON')
})
