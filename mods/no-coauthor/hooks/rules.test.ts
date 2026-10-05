import { describe, expect, test } from 'claude-code/testing'

import { stripClaudeTrailers } from './rules'

const CLAUDE = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const ALICE = 'Co-Authored-By: Alice Martin <alice@example.org>'

describe('stripped', () => {
  const cases: [string, string, string][] = [
    ['single -m with embedded newlines', `git commit -m "fix: x\n\n${CLAUDE}"`, 'git commit -m "fix: x"'],
    ['rtk prefix', `rtk git commit -m "fix: x\n\n${CLAUDE}"`, 'rtk git commit -m "fix: x"'],
    ['single quotes', `git commit -m 'fix: x\n\n${CLAUDE}'`, "git commit -m 'fix: x'"],
    ['separate -m argument', `git commit -m "fix: x" -m "${CLAUDE}"`, 'git commit -m "fix: x"'],
    ['--trailer argument', `git commit -m "fix: x" --trailer "${CLAUDE}"`, 'git commit -m "fix: x"'],
    ['lowercase trailer naming only the email', 'git commit -m "fix\n\nco-authored-by: Bot <noreply@ANTHROPIC.com>"', 'git commit -m "fix"'],
    ['trailer with no email', 'git commit -m "fix\n\nCo-Authored-By: Claude"', 'git commit -m "fix"'],
    [
      'heredoc form',
      `git commit -m "$(cat <<'EOF'\nfeat: add y\n\nBody line.\n\n${CLAUDE}\nEOF\n)"`,
      `git commit -m "$(cat <<'EOF'\nfeat: add y\n\nBody line.\nEOF\n)"`,
    ],
    ['followed by a push', `git add . && git commit -m "fix\n\n${CLAUDE}" && git push`, 'git add . && git commit -m "fix" && git push'],
    ['git -C before commit', `git -C /repo commit -m "fix\n\n${CLAUDE}"`, 'git -C /repo commit -m "fix"'],
  ]
  for (const [name, input, expected] of cases) {
    test(name, () => {
      const out = stripClaudeTrailers(input)
      expect(out.command).toBe(expected)
      expect(out.removed).toBe(1)
    })
  }
})

describe('human co-authors are kept', () => {
  test('human after Claude', () => {
    const out = stripClaudeTrailers(`git commit -m "fix\n\n${CLAUDE}\n${ALICE}"`)
    expect(out.command).toBe(`git commit -m "fix\n\n${ALICE}"`)
    expect(out.removed).toBe(1)
  })

  test('human before Claude', () => {
    const out = stripClaudeTrailers(`git commit -m "fix\n\n${ALICE}\n${CLAUDE}"`)
    expect(out.command).toBe(`git commit -m "fix\n\n${ALICE}"`)
  })

  test('human in a heredoc', () => {
    const out = stripClaudeTrailers(`git commit -m "$(cat <<'EOF'\nfix\n\n${ALICE}\n${CLAUDE}\nEOF\n)"`)
    expect(out.command).toBe(`git commit -m "$(cat <<'EOF'\nfix\n\n${ALICE}\nEOF\n)"`)
  })

  test('human -m argument', () => {
    const input = `git commit -m "fix" -m "${ALICE}" -m "${CLAUDE}"`
    expect(stripClaudeTrailers(input).command).toBe(`git commit -m "fix" -m "${ALICE}"`)
  })
})

describe('left alone', () => {
  const cases: string[] = [
    'git commit -m "fix: x"',
    `git commit -m "fix\n\n${ALICE}"`,
    `echo "${CLAUDE}" > notes.txt`,
    `git log --grep "${CLAUDE}"`,
    'git commit -m "mention claude in the subject"',
  ]
  for (const input of cases) {
    test(input, () => {
      expect(stripClaudeTrailers(input)).toEqual({ command: input, removed: 0 })
    })
  }
})
