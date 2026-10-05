import { describe, expect, test } from 'claude-code/testing'

import { CAP, classifyBash, classifyTool, header, push, row, statusOf } from './classify'

describe('classify', () => {
  test('curl, wget and http extract the host from the URL', () => {
    expect(classifyBash('curl -sL https://api.github.com/repos/x/y?z=1 | jq .')?.host).toBe('api.github.com')
    expect(classifyBash('wget http://Example.com:8080/a.zip')?.host).toBe('example.com')
    expect(classifyBash('FOO=1 rtk curl -I https://a.dev')?.host).toBe('a.dev')
  })

  test('git only counts push, pull, fetch and clone', () => {
    expect(classifyBash('git push origin main')).not.toBeNull()
    expect(classifyBash('git clone git@github.com:me/repo.git')?.host).toBe('github.com')
    expect(classifyBash('git clone https://gitlab.com/a/b.git')?.host).toBe('gitlab.com')
    expect(classifyBash('git status')).toBeNull()
    expect(classifyBash('git commit -m "push to curl"')).toBeNull()
  })

  test('package managers, brew, gh, xcrun notarytool', () => {
    expect(classifyBash('npm install left-pad')?.host).toBe('registry.npmjs.org')
    expect(classifyBash('pnpm add -D vitest')).not.toBeNull()
    expect(classifyBash('npm run build')).toBeNull()
    expect(classifyBash('pip install requests')?.host).toBe('pypi.org')
    expect(classifyBash('brew upgrade')).not.toBeNull()
    expect(classifyBash('brew list')).toBeNull()
    expect(classifyBash('gh pr create --fill')?.host).toBe('github.com')
    expect(classifyBash('xcrun notarytool submit a.dmg --wait')).not.toBeNull()
    expect(classifyBash('xcrun stapler staple a.dmg')).toBeNull()
  })

  test('ssh, scp and rsync need a remote host', () => {
    expect(classifyBash('ssh me@box.lan ls')?.host).toBe('box.lan')
    expect(classifyBash('scp a.txt me@box.lan:/tmp/')?.host).toBe('box.lan')
    expect(classifyBash('rsync -a src/ me@box.lan:dst/')?.host).toBe('box.lan')
    expect(classifyBash('rsync -a src/ dst/')).toBeNull()
  })

  test('chained commands find the network segment; plain ones are ignored', () => {
    expect(classifyBash('cd x && make && curl https://a.io/x')?.target).toBe('curl https://a.io/x')
    expect(classifyBash('ls -la && echo hi')).toBeNull()
  })

  test('tools: WebFetch, WebSearch, MCP, other', () => {
    expect(classifyTool('WebFetch', { url: 'https://docs.x.org/a', prompt: 'p' })).toEqual({
      kind: 'web',
      target: 'https://docs.x.org/a',
      host: 'docs.x.org',
    })
    expect(classifyTool('WebSearch', { query: 'swift 6' })).toEqual({ kind: 'search', target: 'swift 6', host: '' })
    expect(classifyTool('mcp__linear__create_issue', {})).toEqual({
      kind: 'mcp',
      target: 'linear › create_issue',
      host: 'linear',
    })
    expect(classifyTool('Read', {})).toBeNull()
  })

  test('statusOf, push cap, header and row', () => {
    expect(statusOf({ deny: 'no' })).toBe('denied')
    expect(statusOf({ isError: true })).toBe('✗')
    expect(statusOf({})).toBe('✓')
    let list: ReturnType<typeof push> = []
    for (let i = 0; i < CAP + 3; i++) list = push(list, { kind: 'web', target: `u${i}`, host: `h${i % 2}`, status: '✓', sub: false })
    expect(list).toHaveLength(CAP)
    expect(list[0]?.target).toBe(`u${CAP + 2}`)
    expect(header(list)).toBe('100 requests · 2 hosts')
    expect(header([])).toBe('0 requests · 0 hosts')
    const line = row({ kind: 'bash', target: 'x'.repeat(90), host: 'a.io', status: '✗', sub: true }, 40)
    expect(line.length).toBeLessThanOrEqual(38)
    expect(line.endsWith(' · a.io')).toBe(true)
  })
})
