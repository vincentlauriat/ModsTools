import type { FlakyState, TestRecord } from '../types'

export const EMPTY: FlakyState = { edits: 0, tests: {} }
export const CAP = 50

export type Ev = { kind: 'edit' } | { kind: 'test'; cmd: string; ok: boolean; at: number }

const TEST_COMMAND = /(^|[\s;&|(])(npm\s+test|pnpm\s+test|yarn\s+test|vitest|jest|pytest|cargo\s+test|go\s+test|swift\s+test|xcodebuild\s(?:\S+\s)*?test|claude\s+plugin\s+test)(\s|$)/
const ENV_PREFIX = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/
const RTK = /(^|[\s;&|(])rtk\s+/g

// Strips env assignments and `rtk` proxies, collapses whitespace.
export function normalize(command: string): string {
  const flat = command.trim().replace(/\s+/g, ' ')
  return flat.replace(ENV_PREFIX, '').replace(RTK, '$1').replace(ENV_PREFIX, '')
}

export const isTestCommand = (command: string): boolean => TEST_COMMAND.test(normalize(command))

const fresh = (at: number): TestRecord => ({ fails: 0, passes: 0, failedAtEdit: null, flaky: false, lastSeen: at })

// A test is flaky when it passes after a failure with no edit since that failure.
export function record(state: FlakyState, ev: Ev): { state: FlakyState; newlyFlaky: string | null } {
  if (ev.kind === 'edit') return { state: { ...state, edits: state.edits + 1 }, newlyFlaky: null }
  const cmd = normalize(ev.cmd)
  const prev = state.tests[cmd] ?? fresh(ev.at)
  const unchanged = prev.failedAtEdit !== null && prev.failedAtEdit === state.edits
  const flaky = ev.ok && unchanged
  const next: TestRecord = {
    fails: prev.fails + (ev.ok ? 0 : 1),
    passes: prev.passes + (ev.ok ? 1 : 0),
    failedAtEdit: ev.ok ? null : state.edits,
    flaky: prev.flaky || flaky,
    lastSeen: ev.at,
  }
  const tests = { ...state.tests, [cmd]: next }
  const keys = Object.keys(tests)
  if (keys.length > CAP) {
    const oldest = keys.reduce((a, b) => ((tests[a]?.lastSeen ?? 0) <= (tests[b]?.lastSeen ?? 0) ? a : b))
    delete tests[oldest]
  }

  return { state: { ...state, tests }, newlyFlaky: flaky && !prev.flaky ? cmd : null }
}

export function flakyList(state: FlakyState): { cmd: string; rec: TestRecord }[] {
  return Object.entries(state.tests)
    .filter(([, rec]) => rec.flaky)
    .map(([cmd, rec]) => ({ cmd, rec }))
    .sort((a, b) => b.rec.lastSeen - a.rec.lastSeen)
}

const clock = (at: number) => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// "<command> · <fails> fail / <passes> pass · <hh:mm>", the command cut so the row fits `columns`.
export function row(cmd: string, rec: TestRecord, columns: number): string {
  const tail = ` · ${rec.fails} fail / ${rec.passes} pass · ${clock(rec.lastSeen)}`
  const room = Math.max(8, columns - tail.length)
  const shown = cmd.length > room ? cmd.slice(0, room - 1) + '…' : cmd

  return shown + tail
}
