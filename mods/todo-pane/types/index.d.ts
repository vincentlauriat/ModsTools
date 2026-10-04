export type TodoItem = { index: number; kind: 'heading' | 'todo'; text: string; done: boolean }

declare module 'claude-code' {
  interface PluginState {
    'todo-pane': { items: TodoItem[] | null }
  }
}
