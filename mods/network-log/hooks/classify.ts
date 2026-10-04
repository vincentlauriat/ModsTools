import type { NetEntry } from '../types'

export const CAP = 100

export type Hit = { kind: NetEntry['kind']; target: string; host: string }

const URL_HOST = /\b[a-z][a-z0-9+.-]*:\/\/(?:[^/@\s'"]*@)?([^/:?#\s'"]+)/i
const SCP_HOST = /(?:^|[\s'"])(?:[\w.-]+@)?([\w.-]+\.[\w.-]+|[\w-]+):(?!\/\/)[^\s]/

const NPM_LIKE = new Set(['npm', 'pnpm', 'yarn'])
const WRAPPERS = new Set(['sudo', 'rtk', 'time', 'command', 'env'])

export const hostOf = (text: string): string => URL_HOST.exec(text)?.[1]?.toLowerCase() ?? ''

function remoteHost(text: string): string {
  const url = hostOf(text)
  return url !== '' ? url : (SCP_HOST.exec(text)?.[1]?.toLowerCase() ?? '')
}

function words(segment: string): string[] {
  const list = segment.trim().split(/\s+/)
  while (list.length > 0 && (/^[A-Za-z_]\w*=/.test(list[0]!) || WRAPPERS.has(list[0]!))) list.shift()
  return list
}

/** The network-touching command of one simple shell segment, or null. */
function segmentHost(segment: string): string | null {
  const [cmd, ...rest] = words(segment)
  if (cmd === undefined) return null
  const sub = rest.find(word => !word.startsWith('-'))
  const joined = rest.join(' ')
  switch (cmd) {
    case 'curl':
    case 'wget':
    case 'http':
    case 'xh':
      return hostOf(joined)
    case 'ssh':
      return sub?.replace(/^.*@/, '').toLowerCase() ?? ''
    case 'scp':
      return remoteHost(joined)
    case 'rsync':
      return /(^|\s)(?:[\w.-]+@)?[\w.-]+:(?!\/\/)\S|:\/\//.test(joined) ? remoteHost(joined) : null
    case 'gh':
      return 'github.com'
    case 'git':
      return sub !== undefined && ['push', 'pull', 'fetch', 'clone'].includes(sub) ? remoteHost(joined) : null
    case 'pip':
    case 'pip3':
      return sub === 'install' ? 'pypi.org' : null
    case 'brew':
      return sub === 'install' || sub === 'upgrade' ? 'brew' : null
    case 'xcrun':
      return sub === 'notarytool' ? 'apple.com' : null
    default:
      return NPM_LIKE.has(cmd) && sub !== undefined && ['install', 'i', 'add', 'publish'].includes(sub)
        ? 'registry.npmjs.org'
        : null
  }
}

/** The first network segment of a Bash command (split on && || ; | and newlines). */
export function classifyBash(command: string): Hit | null {
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const host = segmentHost(segment)
    if (host !== null) return { kind: 'bash', target: segment.trim().replace(/\s+/g, ' '), host }
  }
  return null
}

export function classifyTool(tool: string, input: Record<string, unknown>): Hit | null {
  if (tool === 'WebFetch') {
    const url = String(input.url ?? '')
    return { kind: 'web', target: url, host: hostOf(url) }
  }
  if (tool === 'WebSearch') return { kind: 'search', target: String(input.query ?? ''), host: '' }
  if (tool === 'Bash') return classifyBash(String(input.command ?? ''))
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  return mcp ? { kind: 'mcp', target: `${mcp[1]} › ${mcp[2]}`, host: mcp[1]! } : null
}

export function statusOf(ran: { deny?: string; isError?: boolean }): string {
  if (ran.deny !== undefined) return 'denied'
  return ran.isError === true ? '✗' : '✓'
}

export const push = (list: NetEntry[], entry: NetEntry) => [entry, ...list].slice(0, CAP)

export function header(list: NetEntry[]): string {
  const hosts = new Set(list.map(one => one.host).filter(host => host !== ''))
  return `${list.length} request${list.length === 1 ? '' : 's'} · ${hosts.size} host${hosts.size === 1 ? '' : 's'}`
}

/** "<status> <kind> <target> · <host>", cut to `columns` (the dim "↳ " marker is drawn apart). */
export function row(entry: NetEntry, columns: number): string {
  const head = `${entry.status} ${entry.kind} `
  const tail = entry.host !== '' && !entry.target.includes(entry.host) ? ` · ${entry.host}` : ''
  const room = Math.max(8, columns - head.length - tail.length - (entry.sub ? 2 : 0))
  const target = entry.target.split('\n')[0] ?? ''
  const shown = target.length > room ? target.slice(0, room - 1) + '…' : target

  return head + shown + tail
}
