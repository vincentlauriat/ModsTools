import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import {
  SPEC,
  addFolder,
  ancestors,
  bandText,
  dirName,
  display,
  generatedFolders,
  isSpec,
  isSwift,
  removeFolders,
  resolve,
  runToast,
  swiftTargets,
} from './sync'

const RUN_MS = 60_000
const pending = atom({ plugin: 'xcodegen-sync', key: 'pending' } as const, [])

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get('enabled').catch(() => undefined)) !== false
}

async function homeOf($: EngineInterface): Promise<string | null> {
  const home = await $.env.get('HOME').catch(() => undefined)

  return home === undefined || !home.startsWith('/') ? null : home.replace(/\/$/, '')
}

// The closest folder at or above `dir` holding a project.yml, or null.
async function projectRoot($: EngineInterface, dir: string): Promise<string | null> {
  for (const folder of ancestors(dir)) {
    const spec = folder === '/' ? `/${SPEC}` : `${folder}/${SPEC}`
    if (await $.fs.exists(spec).catch(() => false)) return folder
  }

  return null
}

async function track($: EngineInterface, dirs: string[]) {
  const roots: string[] = []
  for (const dir of new Set(dirs)) {
    const root = await projectRoot($, dir)
    if (root !== null && !roots.includes(root)) roots.push(root)
  }
  if (roots.length > 0) await update($, pending, list => roots.reduce(addFolder, list))
}

async function runXcodegen($: EngineInterface, folder: string) {
  const home = await homeOf($)
  try {
    const ran = await $.process.run(['xcodegen', 'generate'], { cwd: folder, timeoutMs: RUN_MS })
    if (ran.exitCode === 0) await update($, pending, list => removeFolders(list, [folder]))
    $.ui.toast(runToast(folder, home, ran.exitCode, ran.stderr, ran.stdout))
  } catch {
    $.ui.toast(`xcodegen could not run in ${display(folder, home)} (not installed, or over 60s)`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'xcodegen-sync',
      description: 'Folders waiting for xcodegen generate (off | on | status)',
    })

    return next(e)
  })

  on('command.run', { command: 'xcodegen-sync' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await $.store.set('enabled', arg === 'on')
      if (arg === 'off') await update($, pending, () => [])
    }
    const state = (await isEnabled($)) ? 'on' : 'off'
    const home = await homeOf($)
    const list = await read($, pending)
    const folders = list.length === 0 ? 'no folder waiting' : `waiting: ${list.map(one => display(one, home)).join(', ')}`

    return { text: `xcodegen-sync is ${state}; ${folders}.` }
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Bash' && e.tool !== 'Edit' && e.tool !== 'Write' && e.tool !== 'NotebookEdit') return next(e)
    const cwd = await $.session.cwd()
    const home = await homeOf($)
    const raw = e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : e.tool === 'NotebookEdit' ? e.notebook_path : null
    const path = raw === null ? null : resolve(cwd, raw, home)
    // A Write creates a Swift file only when it did not exist before the call.
    const isNewSwift = e.tool === 'Write' && path !== null && isSwift(path) && !(await $.fs.exists(path).catch(() => true))

    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    if (e.tool === 'Bash') {
      const done = generatedFolders(e.command, cwd, home)
      if (done.length > 0) await update($, pending, list => removeFolders(list, done))
    }
    if (e.agentId !== undefined || !(await isEnabled($))) return ran

    if (e.tool === 'Bash') await track($, swiftTargets(e.command, cwd, home).map(dirName))
    else if (path !== null && (isSpec(path) || isNewSwift)) await track($, [dirName(path)])

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, pending)
    if (list.length === 0 || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const home = await homeOf($)

    return (
      <Box flexDirection="column">
        {list.map(folder => (
          <Box>
            <Text color="yellow">{bandText(folder, home)} </Text>
            <Button key={`run:${folder}`} label="Run xcodegen" onPress={() => runXcodegen($, folder)} />
            <Button key={`dismiss:${folder}`} label="Dismiss" onPress={() => update($, pending, all => removeFolders(all, [folder]))} />
          </Box>
        ))}
      </Box>
    )
  })
}
