export type HeatmapTool = { tool: string; calls: number; failures: number }

declare module 'claude-code' {
  interface PluginState {
    'tool-heatmap': { tools: HeatmapTool[] }
  }
}
