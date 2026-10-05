import type { Register } from 'claude-code'

import { stripClaudeTrailers } from './rules'

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const { command, removed } = stripClaudeTrailers(e.command)
    if (removed === 0) return next(e)
    $.ui.toast(`no-coauthor: removed ${removed} Claude co-author trailer${removed > 1 ? 's' : ''} from the commit`)

    return next({ ...e, command })
  })
}
