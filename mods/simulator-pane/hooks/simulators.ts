import type { Simulator } from '../types'

export const UNAVAILABLE = 'simctl unavailable'
export const ALL = 'all'

const PLATFORM_NAMES: Record<string, string> = { xrOS: 'visionOS' }

// `com.apple.CoreSimulator.SimRuntime.iOS-27-0` → `iOS 27.0`; `xrOS-2-0` → `visionOS 2.0`; anything else is kept as its tail.
export function runtimeName(identifier: string): string {
  const tail = identifier.slice(identifier.lastIndexOf('.') + 1)
  const match = /^(.+?)-(\d+(?:-\d+)*)$/.exec(tail)
  if (match === null) return tail
  const platform = match[1]!

  return `${PLATFORM_NAMES[platform] ?? platform} ${match[2]!.replace(/-/g, '.')}`
}

// The booted devices of `xcrun simctl list devices [booted] -j`, sorted by runtime then name; null when the text is not that JSON.
export function parseBooted(stdout: string): Simulator[] | null {
  let json: unknown
  try {
    json = JSON.parse(stdout)
  } catch {
    return null
  }
  const devices = (json as { devices?: unknown } | null)?.devices
  if (devices === null || typeof devices !== 'object' || Array.isArray(devices)) return null
  const list: Simulator[] = []
  for (const [runtime, entries] of Object.entries(devices as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries as { udid?: unknown; name?: unknown; state?: unknown }[]) {
      if (entry?.state !== 'Booted' || typeof entry.udid !== 'string' || typeof entry.name !== 'string') continue
      list.push({ udid: entry.udid, name: entry.name, runtime: runtimeName(runtime) })
    }
  }

  return list.sort((a, b) => a.runtime.localeCompare(b.runtime) || a.name.localeCompare(b.name))
}

export const shortUdid = (udid: string) => udid.slice(0, 8)

export const rowLabel = (sim: Simulator) => `${sim.name} · ${sim.runtime} · ${shortUdid(sim.udid)}`

export const countLabel = (count: number) => (count === 0 ? 'No booted simulators' : `${count} booted simulator${count === 1 ? '' : 's'}`)

// The status line text, or undefined to clear it.
export const statusText = (count: number | null) => (count === null || count === 0 ? undefined : `📱 ${count} booted`)

export function firstLine(text: string): string {
  return text.split('\n').map(line => line.trim()).find(line => line !== '') ?? ''
}

// The toast after a shutdown: `target` is a simulator's name, or null for all.
export function shutdownToast(target: string | null, exitCode: number, stderr: string): string {
  if (exitCode === 0) return target === null ? 'Shut down all simulators' : `Shut down ${target}`
  const reason = firstLine(stderr)

  return `simctl shutdown failed${reason === '' ? ` (exit ${exitCode})` : `: ${reason}`}`
}
