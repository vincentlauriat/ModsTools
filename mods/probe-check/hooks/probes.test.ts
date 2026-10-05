import { describe, expect, test } from 'claude-code/testing'

import { classify, countUntracked, gitGrepScope, splitSegments } from './probes'

const ids = (command: string) => classify(command).map(f => f.id)

describe('pipe-status', () => {
  test('flags $? read right after a pipeline', () => {
    expect(ids('npm run build | tail -5; echo $?')).toEqual(['pipe-status'])
    expect(ids('make 2>&1 | tail; echo "exit=$?"')).toEqual(['pipe-status'])
    expect(ids('cmd | grep x && echo $?')).toEqual(['pipe-status'])
  })

  test('is quiet when pipefail or PIPESTATUS is used', () => {
    expect(ids('set -o pipefail; cmd | tail; echo $?')).toEqual([])
    expect(ids('set -eo pipefail\ncmd | tail\necho $?')).toEqual([])
    expect(ids('cmd | tail; echo ${PIPESTATUS[0]}')).toEqual([])
    expect(ids('cmd | tail; echo $? ${PIPESTATUS[0]}')).toEqual([])
  })

  test('pipefail set after the pipeline does not help', () => {
    expect(ids('cmd | tail; echo $?; set -o pipefail')).toEqual(['pipe-status'])
  })

  test('is quiet for a simple command, a redirect, or a || in place of a pipe', () => {
    expect(ids('cmd; echo $?')).toEqual([])
    expect(ids('cmd > /dev/null 2>&1; echo $?')).toEqual([])
    expect(ids('cmd || true; echo $?')).toEqual([])
    expect(ids('cmd && echo $?')).toEqual([])
  })

  test('ignores pipes and $? inside quotes', () => {
    expect(ids('echo "a | b"; echo $?')).toEqual([])
    expect(ids("cmd | tail; echo '$?'")).toEqual([])
    expect(ids('cmd | tail; echo "$?"')).toEqual(['pipe-status'])
  })

  test('$? not directly after the pipeline is not flagged', () => {
    expect(ids('cmd | tail; echo done; echo $?')).toEqual([])
  })
})

describe('assign-pipe-status', () => {
  test('flags $? after an assignment from a pipeline', () => {
    expect(ids('x=$(a | b); echo $?')).toEqual(['assign-pipe-status'])
    expect(ids('export x=$(a | b)\necho "rc=$?"')).toEqual(['assign-pipe-status'])
  })

  test('is quiet without a pipe or without $?', () => {
    expect(ids('x=$(a); echo $?')).toEqual([])
    expect(ids('x=$(a | b); echo "$x"')).toEqual([])
    expect(ids('echo $(a | b); echo $?')).toEqual([])
  })
})

describe('gitGrepScope', () => {
  test('finds git grep with its directory and pathspecs', () => {
    expect(gitGrepScope('git grep -n -e "@x" -e KEY -- mods/new')).toEqual({ dir: null, pathspecs: ['mods/new'] })
    expect(gitGrepScope('rtk git -C repo grep foo -- a b | head')).toEqual({ dir: 'repo', pathspecs: ['a', 'b'] })
    expect(gitGrepScope('FOO=1 git grep foo')).toEqual({ dir: null, pathspecs: [] })
    expect(gitGrepScope('make && git grep foo -- src 2>&1')).toEqual({ dir: null, pathspecs: ['src'] })
  })

  test('is null without git grep or when it searches untracked files itself', () => {
    expect(gitGrepScope('grep -rn foo .')).toBeNull()
    expect(gitGrepScope('git log --grep foo')).toBeNull()
    expect(gitGrepScope('git grep --untracked foo')).toBeNull()
    expect(gitGrepScope('git grep --no-index foo')).toBeNull()
  })
})

test('countUntracked counts ?? lines only', () => {
  expect(countUntracked('?? a.ts\n M b.ts\n?? c/d.ts\n')).toBe(2)
  expect(countUntracked('')).toBe(0)
})

describe('grep-absent', () => {
  test('flags grep || echo "not found" on an unchecked path', () => {
    expect(ids('grep -q foo config.yml || echo "not found"')).toEqual(['grep-absent'])
    expect(ids('grep foo config.yml && echo found || echo "absent"')).toEqual(['grep-absent'])
  })

  test('is quiet when the path is checked, piped, or has no file operand', () => {
    expect(ids('[ -f config.yml ] && grep -q foo config.yml || echo "not found"')).toEqual([])
    expect(ids('cat f | grep foo || echo none')).toEqual([])
    expect(ids('grep -q foo || echo "not found"')).toEqual([])
    expect(ids('grep -q foo config.yml || echo "failed"')).toEqual([])
  })
})

test('one command can raise several distinct findings', () => {
  expect(ids('x=$(a | b); echo $?; grep -q foo f.txt || echo "not found"')).toEqual(['assign-pipe-status', 'grep-absent'])
})

test('splitSegments splits on top-level separators only', () => {
  const parts = splitSegments('a && b $(c; d) || e; f\ng').map(s => s.raw.trim())
  expect(parts).toEqual(['a', 'b $(c; d)', 'e', 'f', 'g'])
})
