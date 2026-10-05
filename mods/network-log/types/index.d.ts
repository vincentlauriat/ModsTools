export type NetKind = 'web' | 'search' | 'mcp' | 'bash'
export type NetEntry = { kind: NetKind; target: string; host: string; status: string; sub: boolean }

declare module 'claude-code' {
  interface PluginState {
    'network-log': { entries: NetEntry[] }
  }
}
