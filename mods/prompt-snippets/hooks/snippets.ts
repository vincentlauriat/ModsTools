export type Snippets = Record<string, string>

const NAME = /^[a-z0-9_-]+$/
const TOKEN = /;;([a-z0-9_-]+)(?![A-Za-z0-9_-])/g

export const isValidName = (name: string) => NAME.test(name)

export type Command =
  | { action: 'add'; name: string; text: string }
  | { action: 'rm'; name: string }
  | { action: 'show'; name: string }
  | { action: 'list' }
  | { action: 'error'; message: string }

export function parseCommand(args: string): Command {
  const m = /^\s*(\S+)(?:\s+(\S+))?(?:\s+([\s\S]*))?$/.exec(args)
  const action = m?.[1] ?? 'list'
  const name = m?.[2] ?? ''
  const text = (m?.[3] ?? '').trim()
  if (action === 'list') return { action: 'list' }
  if (action !== 'add' && action !== 'rm' && action !== 'show') {
    return { action: 'error', message: 'Usage: /snip add <name> <text> | rm <name> | list | show <name>' }
  }
  if (!isValidName(name)) return { action: 'error', message: `Invalid name "${name}": use a-z, 0-9, _ and -.` }
  if (action === 'add') {
    return text === '' ? { action: 'error', message: 'Usage: /snip add <name> <text>' } : { action, name, text }
  }

  return { action, name } as Command
}

export function expand(text: string, snippets: Snippets): { text: string; unknown: string[] } {
  const unknown: string[] = []
  const out = text.replace(TOKEN, (token, name: string, offset: number) => {
    const before = offset === 0 ? '' : text.charAt(offset - 1)
    if (/[A-Za-z0-9_;-]/.test(before)) return token
    const body = Object.hasOwn(snippets, name) ? snippets[name] : undefined
    if (body === undefined) {
      if (!unknown.includes(name)) unknown.push(name)
      return token
    }

    return body
  })

  return { text: out, unknown }
}
