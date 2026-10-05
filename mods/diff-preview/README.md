# diff-preview

A pane showing `git diff --stat` and the number of untracked files for the session folder, so you can see what changed without leaving Claude Code.

## What it does
- Runs `git diff --stat` and `git status --porcelain` in the session folder when the pane is opened or refreshed, and again after each main-conversation turn (subagent turns are ignored).
- Shows the stat lines (as many as fit the pane), then the untracked-file count in bold (`3 untracked files`).
- Shows `No changes to tracked files.` when the diff is empty, `not a git repository` when git fails, `git unavailable` when it cannot run.

## Commands
| Command | Effect |
|---|---|
| `/diff-preview` | Refresh and open the pane |
| `/diff-preview refresh` | Same, reported as "refreshed" |
| `/diff-preview close` (or `off`) | Close the pane |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/diff-preview
```

## Limits
- Refreshes at the end of a turn (and on the command), not after a manual edit or `/compact`.
- `git diff --stat` covers unstaged changes to tracked files only; staged changes are not shown.
- Untracked files are counted, not listed.

## Develop

```sh
claude plugin validate mods/diff-preview
claude plugin test mods/diff-preview   # 7 tests
```
