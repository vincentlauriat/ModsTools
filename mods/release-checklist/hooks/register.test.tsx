import { expect, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

const PANE = {
  component: 'Pane',
  requestId: 'release-checklist',
  props: { title: 'Release checklist', isFocused: false, bodyColumns: 90, placement: 'dock' } as never,
} as const

const out = (stdout: string, exitCode = 0): ProcessRunResult => ({
  exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
})

const FILES: Record<string, string> = {
  '/proj/project.yml': 'MARKETING_VERSION: "1.0.0"\n',
  '/proj/Scripts/release.sh': 'NOTARY_PROFILE="${NOTARY_PROFILE:-AppliMacVincentGithub}"\nRELEASE_DIR="$ROOT/release"\n',
  '/proj/.gitignore': '*.dmg\n',
  '/proj/CHANGES.md': '## 1.0.0\n',
}

function world(on: On, opts: { identity?: boolean; secFails?: boolean } = {}) {
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.read', (_$, e) => {
    const text = FILES[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('process.run', (_$, e) => {
    if (e.argv[0] === 'security') {
      if (opts.secFails) throw new Error('spawn failed')
      return { value: out(opts.identity === false ? '0 valid identities found' : '1) X "Developer ID Application: V (K)"') }
    }
    if (e.argv[1] === 'rev-parse') return { value: out('feat/x\n') }
    return { value: out('') }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }) as never)
}

test('/release-checklist 1.0.0 runs the checks into the pane', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: 'ok' as never }))
  const ran = await $.command.run({ command: 'release-checklist', args: '1.0.0' } as never)
  expect('text' in ran ? ran.text : '').toBe('Release checklist: 7 checks, none failed.')

  const ui = await $.ui.mount({ plugin: 'release-checklist', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '1.0.0 · 7 checks, none failed' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^✓ release.sh · NOTARY_PROFILE default AppliMacVincentGithub/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✓ git · clean on feat/x' })).toBeDefined()
  await ui.unmount()
})

test('a missing identity and a throwing security tool are reported, not thrown', async ($, on) => {
  world(on, { identity: false })
  on('tool.call', () => ({ result: 'ok' as never }))
  const ran = await $.command.run({ command: 'release-checklist', args: '' } as never)
  expect('text' in ran ? ran.text : '').toBe('Release checklist: 1 of 7 checks failed.')
})

test('security failing to start skips the identity check', async ($, on) => {
  world(on, { secFails: true })
  on('tool.call', () => ({ result: 'ok' as never }))
  await $.command.run({ command: 'release-checklist', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'release-checklist', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '– Developer ID · security unavailable' })).toBeDefined()
  await ui.unmount()
})

test('a successful release.sh toasts the independent checks; failures and other commands do not', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.call', (_$, e) => {
    const command = (e as { command: string }).command
    if (command.includes('fails')) return { isError: true, result: undefined, text: 'Exit code 1' } as never
    return { result: 'ok' as never }
  })

  await $.tool.call({ tool: 'Bash', command: './Scripts/release.sh 1.0.0' })
  await $.tool.call({ tool: 'Bash', command: './Scripts/release.sh fails' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('spctl -a -t exec -vv')
  expect(toasts[0]).toContain('xcrun stapler validate')
  expect(toasts[0]).toContain('codesign --verify --deep --strict')
})

test('/release-checklist close closes the pane', async ($, on) => {
  const closed: string[] = []
  on('ui.close', (_$, e) => {
    closed.push(e.id)
    return { value: undefined } as never
  })
  await $.command.run({ command: 'release-checklist', args: 'close' } as never)
  expect(closed).toEqual(['release-checklist'])
})
