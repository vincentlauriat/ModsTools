import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BuildReport } from '../types'

// A build that runs longer than this is cut off.
const BUILD_TIMEOUT_MS = 10 * 60 * 1000
const MAX_ERRORS = 20

const last = atom({ plugin: 'xcode-build-watch', key: 'last' } as const, null)

type Project =
  | { root: string; kind: 'package' }
  | { root: string; kind: 'xcode'; flag: '-workspace' | '-project'; path: string }
  | { root: string; kind: 'xcodegen-only' }

const parent = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0)) || '/'
const base = (path: string) => path.slice(path.lastIndexOf('/') + 1)

// The one named after its folder (not a Finder copy like "App 2.xcodeproj"), else the first.
const pick = (names: string[], suffix: string, folder: string) =>
  names.find(name => name === folder + suffix) ?? names.find(name => name.endsWith(suffix))

// The nearest folder above `file` that holds a workspace, an Xcode project, a Package.swift or a project.yml.
async function findProject($: EngineInterface, file: string): Promise<Project | null> {
  for (let dir = parent(file); dir !== '/' && dir !== ''; dir = parent(dir)) {
    const names = (await $.fs.list(dir).catch(() => [])).map(entry => entry.name).sort()
    const workspace = pick(names, '.xcworkspace', base(dir))
    const project = pick(names, '.xcodeproj', base(dir))
    if (workspace !== undefined) return { root: dir, kind: 'xcode', flag: '-workspace', path: `${dir}/${workspace}` }
    if (project !== undefined) return { root: dir, kind: 'xcode', flag: '-project', path: `${dir}/${project}` }
    if (names.includes('Package.swift')) return { root: dir, kind: 'package' }
    if (names.includes('project.yml')) return { root: dir, kind: 'xcodegen-only' }
  }

  return null
}

// The scheme named like the project, else the first one xcodebuild lists.
async function scheme($: EngineInterface, project: Extract<Project, { kind: 'xcode' }>): Promise<string | undefined> {
  const listed = await $.process.run(['xcodebuild', '-list', '-json', project.flag, project.path], { cwd: project.root })
  if (listed.exitCode !== 0) return undefined
  try {
    const json = JSON.parse(listed.stdout) as { project?: { schemes?: string[] }; workspace?: { schemes?: string[] } }
    const schemes = json.project?.schemes ?? json.workspace?.schemes ?? []
    const name = base(project.path).replace(/\.(xcodeproj|xcworkspace)$/, '')

    return schemes.includes(name) ? name : schemes[0]
  } catch {
    return undefined
  }
}

const errorLines = (output: string) =>
  [...new Set(output.split('\n').filter(line => /\berror:/.test(line)).map(line => line.trim()))].slice(0, MAX_ERRORS)

async function build($: EngineInterface, project: Project): Promise<BuildReport> {
  const name = base(project.root)
  if (project.kind === 'xcodegen-only') {
    return { project: name, isOk: false, seconds: 0, errors: ['project.yml without .xcodeproj: run xcodegen generate first'] }
  }
  let argv: string[]
  if (project.kind === 'package') {
    argv = ['swift', 'build']
  } else {
    const chosen = await scheme($, project)
    if (chosen === undefined) return { project: name, isOk: false, seconds: 0, errors: ['no scheme found (xcodebuild -list)'] }
    argv = ['xcodebuild', project.flag, project.path, '-scheme', chosen, '-configuration', 'Debug', '-quiet', 'CODE_SIGNING_ALLOWED=NO', 'build']
  }
  const startedAt = await $.clock.now()
  const ran = await $.process.run(argv, { cwd: project.root, timeoutMs: BUILD_TIMEOUT_MS })
  const seconds = Math.round(((await $.clock.now()) - startedAt) / 1000)
  const errors = ran.exitCode === 0 ? [] : errorLines(`${ran.stdout}\n${ran.stderr}`)
  if (ran.exitCode !== 0 && errors.length === 0) errors.push(`${argv[0]} exited with ${ran.exitCode}`)

  return { project: name, isOk: ran.exitCode === 0, seconds, errors }
}

function describe(report: BuildReport): string {
  if (report.isOk) return `✅ ${report.project} builds (${report.seconds}s)`
  const count = report.errors.length

  return `❌ ${report.project}: build failed, ${count} error${count === 1 ? '' : 's'}`
}

// Projects whose Swift files the current turn edited, by root.
const pending = new Map<string, Project>()
const running = new Set<string>()
const again = new Set<string>()

async function run($: EngineInterface, project: Project): Promise<void> {
  if (running.has(project.root)) {
    again.add(project.root)
    return
  }
  running.add(project.root)
  $.ui.status(`⏳ building ${base(project.root)}…`)
  try {
    const report = await build($, project)
    await update($, last, () => report)
    $.ui.status(describe(report))
    if (!report.isOk) $.ui.toast(`${describe(report)} — /build-status for details`)
  } finally {
    running.delete(project.root)
  }
  if (again.delete(project.root)) await run($, project)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'build-status',
      description: 'Show the last background Swift build result and its errors',
    })

    return next(e)
  })

  on('command.run', { command: 'build-status' }, async $ => {
    const report = await read($, last)
    if (report === null) return { text: 'No background build yet this session.' }

    return { text: [describe(report), ...report.errors].join('\n') }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const path = e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : undefined
    if (path === undefined || !path.endsWith('.swift') || ran.deny !== undefined || ran.isError === true) return ran
    const project = await findProject($, path)
    if (project !== null) pending.set(project.root, project)

    return ran
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined && pending.size > 0) {
      const projects = [...pending.values()]
      pending.clear()
      $.clock.after(0, () => {
        for (const project of projects) void run($, project)
      })
    }

    return next(e)
  })
}
