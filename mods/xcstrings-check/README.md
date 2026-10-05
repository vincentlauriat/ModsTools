# xcstrings-check

Keeps Xcode String Catalogs (`.xcstrings`) complete: after Claude edits a catalog or Swift code beside one, it shows which translations are still pending.

## What it does
- Watches successful `Edit`/`Write` calls made by the main conversation on `.xcstrings` files, and on `.swift` files of a project that holds catalogs.
- The project is the closest folder with `.git`, `project.yml`, `Package.swift` or an Xcode project. Its catalogs are found once (hidden, build, `node_modules`, `Pods`, `DerivedData`… folders skipped) and all re-checked, 2 s after the last edit, never before the tool result is returned. One check at a time per project.
- For each catalog and each language other than the source one (those in the catalog plus the `languages` setting):
  - **missing**: no `stringUnit` for that language, also looked for inside `variations` (plural, device, nested) and `substitutions`;
  - **new** / **needs review**: a `stringUnit` in state `new` / `needs_review`;
  - **stale**: entries with `extractionState: "stale"` (listed once, not counted per language).
  - Keys with `shouldTranslate: false` are ignored. A file that is not valid JSON or not a catalog is reported **unreadable**.
- Status line while anything is pending: `🌐 fr: 3 missing · 1 review`, then `· N stale`, `· N unreadable`. Cleared when every catalog is complete.

## Commands
| Command | Effect |
|---|---|
| `/xcstrings` | Opens the pane: catalog → language → keys (first 8 per list, with counts) |
| `/xcstrings check` | Re-scans and re-checks the session project now |
| `/xcstrings off` | Stops checking and clears the status line (kept across sessions) |
| `/xcstrings on` | Resumes |

## Settings
| Field | Default | Meaning |
|---|---|---|
| `languages` | empty | Comma-separated languages every catalog must cover, e.g. `fr,de` |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/xcstrings-check
```

## Limits
- Only the main conversation's `Edit`/`Write`; catalogs changed by Xcode itself are seen at the next edit or `/xcstrings check`.
- A plural with some categories missing (e.g. `one` but no `other`) counts as translated.
- Catalogs over 4 MiB are reported unreadable; the search stops 8 folders deep or after 2000 folders.

## Develop
```sh
claude plugin validate mods/xcstrings-check
claude plugin test mods/xcstrings-check   # 18 tests
```
