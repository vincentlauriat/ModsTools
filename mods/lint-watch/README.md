# lint-watch

Lints the files Claude just edited, in the background, so lint errors show up while the code is still fresh.

## What it does
- Watches successful `Edit`/`Write` calls made by the main conversation and picks a linter by extension:

  | Files | Linter | Runs when | From folder |
  |---|---|---|---|
  | `.swift` | `swiftlint lint --reporter json --quiet <files>` | `swiftlint` is installed | closest `.swiftlint.yml`, else `.git` / `Package.swift` / `project.yml` |
  | `.ts` `.tsx` `.js` `.jsx` | `npx --no-install eslint -f json <files>` | the project has `node_modules/.bin/eslint` up the tree (nothing is ever installed) | that folder |
  | `.py` | `ruff check --output-format json <files>` | `ruff` is installed | closest `ruff.toml` / `.ruff.toml` / `pyproject.toml`, else `.git` |
  | `.sh` | `shellcheck -f json <files>` | `shellcheck` is installed | closest `.shellcheckrc`, else `.git` |

- Edits are batched: the run starts 2 s after the last edit, never before the tool result is returned. One run at a time per linter and folder; files edited meanwhile are linted right after.
- Each linter is looked up once (`command -v`). No linter available: nothing happens.
- Reads the linters' JSON reports, not their text. Severity: SwiftLint's own, ESLint `2` or fatal, ShellCheck `error`; Ruff has none, so syntax errors and `E9`/`F63`/`F7`/`F82` count as errors and the rest as warnings.
- Status line for the last run: `lint ✓`, or `lint ⚠ 3 · ✗ 1` (warnings · errors), plus `N not linted` when a linter gave no report.
- Toast only when errors appear on a file that had none (or had not been linted yet this session).

## Commands
| Command | Effect |
|---|---|
| `/lint-watch` | Opens the pane (`✗ file:line rule message`, errors first) and says which linters were found |
| `/lint-watch run` | Re-lints every file edited this session, now |
| `/lint-watch off` | Stops linting and clears the status line (kept across sessions) |
| `/lint-watch on` | Resumes |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/lint-watch
```

## Limits
- Only the main conversation's `Edit`/`Write`: files changed by Bash, subagents or formatters are not linted.
- A file's first lint toasts if it already had errors before Claude touched it.
- Up to 50 issues kept per file; a linter run is cut off after 2 minutes.
- ESLint needs a working project config; an ESLint crash shows as "not linted".

## Develop
```sh
claude plugin validate mods/lint-watch
claude plugin test mods/lint-watch   # 20 tests
```
