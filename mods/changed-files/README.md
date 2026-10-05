# changed-files

A pane that lists every file Claude modified during the session, so you can see what changed without reading the transcript.

## What it does
- Records files written by `Edit`, `Write` and `NotebookEdit` (only when the call succeeded).
- Also records files changed through `Bash`: in a git repository, the mod snapshots the dirty, untracked and deleted files (by content hash) before and after each command and records the difference.
- Shows a pane titled "Changed files": `N files changed`, then one line per file (path relative to the session folder, `×N` change count), most recent first.
- The pane opens when the session starts.

## Commands
| Command | Effect |
|---|---|
| `/changed-files` | Open the pane. |
| `/changed-files close` | Close the pane (`off` also works). |
| `/changed-files clear` | Empty the list. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/changed-files
```

## Limits
- Bash tracking only works inside a git repository; elsewhere only Edit/Write/NotebookEdit are seen.
- The Bash snapshot is skipped when more than 2000 paths are dirty.
- A Bash command that rewrites a file with identical content, or leaves it in the same dirty state, is not counted.
- The pane shows as many files as fit its height (newest first).

## Develop
```sh
claude plugin validate mods/changed-files
claude plugin test mods/changed-files   # 6 tests
```
