import { expect, test } from 'claude-code/testing'

import { argv, fileResult, linterFor, linterSummary, newlyFailing, parseReport, statusText, toastText } from './lint'

// Shapes as each linter's JSON reporter writes them (trimmed to the fields that matter).
const SWIFTLINT = JSON.stringify([
  { character: 27, file: '/dev/app/Sources/A.swift', line: 3, reason: 'Force casts should be avoided', rule_id: 'force_cast', severity: 'Error', type: 'Force Cast' },
  { character: 10, file: '/dev/app/Sources/A.swift', line: 2, reason: 'Lines should not have trailing semicolons', rule_id: 'trailing_semicolon', severity: 'Warning', type: 'Trailing Semicolon' },
])
const ESLINT = JSON.stringify([
  {
    filePath: '/dev/web/src/a.ts',
    messages: [
      { ruleId: 'no-unused-vars', severity: 1, message: "'x' is assigned a value but never used.", line: 4, column: 7 },
      { ruleId: null, fatal: true, severity: 2, message: 'Parsing error: Unexpected token', line: 9, column: 1 },
    ],
    errorCount: 1,
    warningCount: 1,
  },
  { filePath: '/dev/web/src/b.tsx', messages: [], errorCount: 0, warningCount: 0 },
])
const RUFF = JSON.stringify([
  { cell: null, code: 'F401', filename: '/dev/py/a.py', location: { column: 8, row: 1 }, message: '`os` imported but unused', noqa_row: 1 },
  { cell: null, code: 'F821', filename: '/dev/py/a.py', location: { column: 5, row: 7 }, message: 'Undefined name `y`', noqa_row: 7 },
  { cell: null, code: null, filename: '/dev/py/a.py', location: { column: 1, row: 9 }, message: 'SyntaxError: Expected an expression' },
])
const SHELLCHECK = JSON.stringify([
  { file: '/dev/sh/run.sh', line: 3, endLine: 3, column: 6, endColumn: 8, level: 'warning', code: 2086, message: 'Double quote to prevent globbing and word splitting.', fix: null },
  { file: '/dev/sh/run.sh', line: 5, endLine: 5, column: 1, endColumn: 4, level: 'error', code: 1073, message: 'Couldn\'t parse this if expression.', fix: null },
  { file: '/dev/sh/run.sh', line: 1, endLine: 1, column: 1, endColumn: 2, level: 'style', code: 2006, message: 'Use $(...) notation.', fix: null },
])

test('the linter follows the extension', () => {
  expect(linterFor('/a/B.swift')).toBe('swiftlint')
  expect(linterFor('/a/b.TSX')).toBe('eslint')
  expect(linterFor('/a/b.jsx')).toBe('eslint')
  expect(linterFor('/a/b.py')).toBe('ruff')
  expect(linterFor('/a/b.sh')).toBe('shellcheck')
  expect(linterFor('/a/b.md')).toBeNull()
  expect(linterFor('/a/.swift')).toBeNull()
  expect(linterFor('/a/Makefile')).toBeNull()
})

test('each linter runs with its JSON reporter and never installs', () => {
  expect(argv('swiftlint', ['/a.swift'])).toEqual(['swiftlint', 'lint', '--reporter', 'json', '--quiet', '/a.swift'])
  expect(argv('eslint', ['/a.ts', '/b.ts'])).toEqual(['npx', '--no-install', 'eslint', '-f', 'json', '/a.ts', '/b.ts'])
  expect(argv('ruff', ['/a.py'])).toEqual(['ruff', 'check', '--output-format', 'json', '/a.py'])
  expect(argv('shellcheck', ['/a.sh'])).toEqual(['shellcheck', '-f', 'json', '/a.sh'])
})

test('SwiftLint report: severity from the reporter, issues sorted errors first', () => {
  const report = parseReport('swiftlint', SWIFTLINT, '/dev/app', ['/dev/app/Sources/A.swift', '/dev/app/Sources/Clean.swift'])
  expect(report?.get('/dev/app/Sources/Clean.swift')).toEqual([])
  expect(report?.get('/dev/app/Sources/A.swift')).toEqual([
    { line: 3, column: 27, rule: 'force_cast', message: 'Force casts should be avoided', severity: 'error' },
    { line: 2, column: 10, rule: 'trailing_semicolon', message: 'Lines should not have trailing semicolons', severity: 'warning' },
  ])
})

test('ESLint report: severity 2 and fatal parse errors are errors', () => {
  const report = parseReport('eslint', ESLINT, '/dev/web', ['/dev/web/src/a.ts', '/dev/web/src/b.tsx'])
  const issues = report?.get('/dev/web/src/a.ts') ?? []
  expect(issues.map(one => [one.severity, one.rule, one.line])).toEqual([
    ['error', 'eslint', 9],
    ['warning', 'no-unused-vars', 4],
  ])
  expect(report?.get('/dev/web/src/b.tsx')).toEqual([])
})

test('Ruff report: syntax errors and E9/F63/F7/F82 are errors, the rest warnings', () => {
  const issues = parseReport('ruff', RUFF, '/dev/py', ['/dev/py/a.py'])?.get('/dev/py/a.py') ?? []
  expect(issues.map(one => [one.severity, one.rule, one.line])).toEqual([
    ['error', 'F821', 7],
    ['error', 'syntax-error', 9],
    ['warning', 'F401', 1],
  ])
})

test('ShellCheck report: level error is an error, warning/info/style are warnings, codes as SCxxxx', () => {
  const issues = parseReport('shellcheck', SHELLCHECK, '/dev/sh', ['/dev/sh/run.sh'])?.get('/dev/sh/run.sh') ?? []
  expect(issues.map(one => [one.severity, one.rule, one.line])).toEqual([
    ['error', 'SC1073', 5],
    ['warning', 'SC2006', 1],
    ['warning', 'SC2086', 3],
  ])
})

test('relative paths in a report are resolved against the root', () => {
  const out = JSON.stringify([{ file: './run.sh', line: 1, column: 1, level: 'error', code: 1, message: 'm' }])
  expect(parseReport('shellcheck', out, '/dev/sh', ['/dev/sh/run.sh'])?.get('/dev/sh/run.sh')?.length).toBe(1)
})

test('output that is not a JSON array is no report', () => {
  expect(parseReport('eslint', 'Oops! Something went wrong!', '/r', ['/r/a.ts'])).toBeNull()
  expect(parseReport('ruff', '{"a":1}', '/r', ['/r/a.py'])).toBeNull()
  expect(parseReport('swiftlint', '', '/r', ['/r/a.swift'])).toBeNull()
})

test('status line counts warnings · errors of the run', () => {
  const issue = (severity: 'error' | 'warning') => ({ line: 1, column: 1, rule: 'r', message: 'm', severity })
  expect(statusText([])).toBe('lint ✓')
  expect(statusText([fileResult('/a', 'a', 'ruff', [])])).toBe('lint ✓')
  expect(statusText([fileResult('/a', 'a', 'ruff', [issue('warning'), issue('warning')]), fileResult('/b', 'b', 'ruff', [issue('warning'), issue('error')])])).toBe(
    'lint ⚠ 3 · ✗ 1',
  )
  expect(statusText([fileResult('/a', 'a', 'ruff', [issue('error')])])).toBe('lint ✗ 1')
})

test('newly failing: errors on a file that had none or no result before', () => {
  const issue = { line: 1, column: 1, rule: 'r', message: 'm', severity: 'error' as const }
  const bad = (path: string) => fileResult(path, path, 'ruff', [issue])
  const before = { '/old': bad('/old'), '/fixed': fileResult('/fixed', '/fixed', 'ruff', []) }
  expect(newlyFailing(before, [bad('/old'), bad('/fixed'), bad('/new'), fileResult('/clean', '/clean', 'ruff', [])]).map(one => one.path)).toEqual([
    '/fixed',
    '/new',
  ])
  expect(toastText([bad('/x/a.py'), bad('/x/b.py')])).toBe('lint: ✗ 2 errors in a.py, b.py — /lint-watch')
})

test('the summary names found and missing linters, eslint per project', () => {
  expect(linterSummary({ swiftlint: true, eslint: true, ruff: false, shellcheck: false }, true)).toBe('Linters found: swiftlint, eslint. Not found: ruff, shellcheck.')
  expect(linterSummary({ swiftlint: false, eslint: true, ruff: false, shellcheck: false }, false)).toBe(
    'No linter found. Not found: swiftlint, eslint (no node_modules/.bin/eslint in this project), ruff, shellcheck.',
  )
})
