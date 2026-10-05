// Pure logic of lint-watch: which linter a file takes, the command line, and the
// linters' JSON reports read into issues. No `$` here: the hooks find roots and run.

import type { FileResult, Issue, LinterName, Severity } from '../types'

export const LINTERS: readonly LinterName[] = ['swiftlint', 'eslint', 'ruff', 'shellcheck']

/** The executable whose presence makes a linter available. */
export const EXECUTABLE: Record<LinterName, string> = {
  swiftlint: 'swiftlint',
  eslint: 'npx',
  ruff: 'ruff',
  shellcheck: 'shellcheck',
}

const EXTENSIONS: Record<string, LinterName> = {
  swift: 'swiftlint',
  ts: 'eslint',
  tsx: 'eslint',
  js: 'eslint',
  jsx: 'eslint',
  py: 'ruff',
  sh: 'shellcheck',
}

export function linterFor(path: string): LinterName | null {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null

  return EXTENSIONS[name.slice(dot + 1).toLowerCase()] ?? null
}

/**
 * Where a linter runs from: the closest folder holding one of `config`, else one of
 * `fallback`, else the file's folder. `required`: without a `config` folder, no run.
 */
export const ROOTS: Record<LinterName, { config: string[]; fallback: string[]; required: boolean }> = {
  swiftlint: { config: ['.swiftlint.yml'], fallback: ['.git', 'Package.swift', 'project.yml'], required: false },
  eslint: { config: ['node_modules/.bin/eslint'], fallback: [], required: true },
  ruff: { config: ['ruff.toml', '.ruff.toml', 'pyproject.toml'], fallback: ['.git'], required: false },
  shellcheck: { config: ['.shellcheckrc'], fallback: ['.git'], required: false },
}

export function argv(linter: LinterName, files: readonly string[]): string[] {
  switch (linter) {
    case 'swiftlint':
      return ['swiftlint', 'lint', '--reporter', 'json', '--quiet', ...files]
    case 'eslint':
      return ['npx', '--no-install', 'eslint', '-f', 'json', ...files]
    case 'ruff':
      return ['ruff', 'check', '--output-format', 'json', ...files]
    case 'shellcheck':
      return ['shellcheck', '-f', 'json', ...files]
  }
}

export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export function dirName(path: string): string {
  const cut = path.lastIndexOf('/')

  return cut <= 0 ? '/' : path.slice(0, cut)
}

/** The folder and every folder above it, closest first, ending at `/`. */
export function ancestors(dir: string): string[] {
  const list = [dir]
  for (let current = dir; current !== '/'; ) {
    current = dirName(current)
    list.push(current)
  }

  return list
}

export const join = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`)

const absolute = (root: string, path: string) => (path.startsWith('/') ? path : join(root, path.replace(/^\.\//, '')))

/** `path` relative to `base` when inside it, else unchanged. */
export function shown(path: string, base: string): string {
  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path
}

type Found = { file: string; issue: Issue }

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)

// SwiftLint `--reporter json`: [{ file, line, character, severity: "Warning"|"Error", rule_id, reason }]
function swiftlint(json: unknown[]): Found[] {
  return json.map((raw): Found => {
    const one = record(raw)

    return {
      file: str(one.file),
      issue: {
        line: num(one.line),
        column: num(one.character),
        rule: str(one.rule_id, 'swiftlint'),
        message: str(one.reason),
        severity: str(one.severity).toLowerCase() === 'error' ? 'error' : 'warning',
      },
    }
  })
}

// ESLint `-f json`: [{ filePath, messages: [{ ruleId, severity: 1|2, fatal?, message, line, column }] }]
function eslint(json: unknown[]): Found[] {
  return json.flatMap(raw => {
    const one = record(raw)
    const messages = Array.isArray(one.messages) ? one.messages : []

    return messages.map((message): Found => {
      const m = record(message)
      const isError = m.fatal === true || m.severity === 2

      return {
        file: str(one.filePath),
        issue: {
          line: num(m.line),
          column: num(m.column),
          rule: str(m.ruleId, 'eslint'),
          message: str(m.message),
          severity: isError ? 'error' : 'warning',
        },
      }
    })
  })
}

// Ruff has no severity: syntax errors and the codes flake8 calls errors (E9, F63, F7, F82) are errors.
const RUFF_ERRORS = /^(E9|F63|F7|F82)/

// Ruff `--output-format json`: [{ filename, code, message, location: { row, column } }]
function ruff(json: unknown[]): Found[] {
  return json.map((raw): Found => {
    const one = record(raw)
    const code = typeof one.code === 'string' ? one.code : null
    const location = record(one.location)
    const isError = code === null || code === 'invalid-syntax' || RUFF_ERRORS.test(code)

    return {
      file: str(one.filename),
      issue: {
        line: num(location.row),
        column: num(location.column),
        rule: code ?? 'syntax-error',
        message: str(one.message),
        severity: isError ? 'error' : 'warning',
      },
    }
  })
}

// ShellCheck `-f json`: [{ file, line, column, level: "error"|"warning"|"info"|"style", code, message }]
function shellcheck(json: unknown[]): Found[] {
  return json.map((raw): Found => {
    const one = record(raw)

    return {
      file: str(one.file),
      issue: {
        line: num(one.line),
        column: num(one.column),
        rule: typeof one.code === 'number' ? `SC${one.code}` : str(one.code, 'shellcheck'),
        message: str(one.message),
        severity: one.level === 'error' ? 'error' : 'warning',
      },
    }
  })
}

const PARSERS: Record<LinterName, (json: unknown[]) => Found[]> = { swiftlint, eslint, ruff, shellcheck }

const ORDER: Record<Severity, number> = { error: 0, warning: 1 }

/**
 * The issues of each linted file (absolute paths, every file present, maybe empty),
 * or null when the output is not the linter's JSON report.
 */
export function parseReport(linter: LinterName, stdout: string, root: string, files: readonly string[]): Map<string, Issue[]> | null {
  let json: unknown
  try {
    json = JSON.parse(stdout.trim() === '' ? 'null' : stdout)
  } catch {
    return null
  }
  if (!Array.isArray(json)) return null
  const byFile = new Map<string, Issue[]>(files.map(file => [file, []]))
  for (const { file, issue } of PARSERS[linter](json)) {
    const path = absolute(root, file)
    byFile.set(path, [...(byFile.get(path) ?? []), issue])
  }
  for (const [file, issues] of byFile) {
    byFile.set(file, [...issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.line - b.line || a.column - b.column))
  }

  return byFile
}

export const MAX_ISSUES = 50

/** One file's result: its issues (at most MAX_ISSUES kept) with the full counts. */
export function fileResult(path: string, shownPath: string, linter: LinterName, issues: readonly Issue[], failure?: string): FileResult {
  const errors = issues.filter(issue => issue.severity === 'error').length
  const result: FileResult = { path, shown: shownPath, linter, errors, warnings: issues.length - errors, issues: issues.slice(0, MAX_ISSUES) }

  return failure === undefined ? result : { ...result, failure }
}

export function totals(results: readonly FileResult[]): { errors: number; warnings: number } {
  return results.reduce((sum, one) => ({ errors: sum.errors + one.errors, warnings: sum.warnings + one.warnings }), {
    errors: 0,
    warnings: 0,
  })
}

/** `lint ✓`, or `lint ⚠ 3 · ✗ 1` (warnings · errors, a zero part left out), then files not linted. */
export function statusText(results: readonly FileResult[]): string {
  const { errors, warnings } = totals(results)
  const failed = results.filter(one => one.failure !== undefined).length
  if (errors === 0 && warnings === 0 && failed === 0) return 'lint ✓'
  const parts = [warnings > 0 ? `⚠ ${warnings}` : '', errors > 0 ? `✗ ${errors}` : '', failed > 0 ? `${failed} not linted` : ''].filter(Boolean)

  return `lint ${parts.join(' · ')}`
}

/** The files of `next` with errors that had none (or no result) in `before`. */
export function newlyFailing(before: Readonly<Record<string, FileResult>>, next: readonly FileResult[]): FileResult[] {
  return next.filter(one => one.errors > 0 && (before[one.path]?.errors ?? 0) === 0)
}

export function toastText(failing: readonly FileResult[]): string {
  const errors = failing.reduce((sum, one) => sum + one.errors, 0)
  const names = failing.map(one => baseName(one.path))
  const list = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')

  return `lint: ✗ ${errors} error${errors === 1 ? '' : 's'} in ${list} — /lint-watch`
}

export function issueLine(result: FileResult, issue: Issue): string {
  return `${issue.severity === 'error' ? '✗' : '⚠'} ${result.shown}:${issue.line} ${issue.rule} ${issue.message}`
}

/** `/lint-watch` summary of which linters were found. */
export function linterSummary(found: Readonly<Record<LinterName, boolean>>, hasProjectEslint: boolean): string {
  const names = LINTERS.filter(name => found[name] && (name !== 'eslint' || hasProjectEslint))
  const missing = LINTERS.filter(name => !names.includes(name))
  const label = (name: LinterName) => (name === 'eslint' && found.eslint ? 'eslint (no node_modules/.bin/eslint in this project)' : name)

  return [
    names.length === 0 ? 'No linter found.' : `Linters found: ${names.join(', ')}.`,
    missing.length === 0 ? '' : `Not found: ${missing.map(label).join(', ')}.`,
  ]
    .filter(Boolean)
    .join(' ')
}
