# edit-undo

A per-session safety net for the files Claude edits: every `Edit`, `Write` and `NotebookEdit` of the main agent leaves a snapshot you can roll back to, one file at a time.

## What it does
- Before a main-agent `Edit`/`Write`/`NotebookEdit` runs, reads the file (or notes that it did not exist). The snapshot is kept only if the tool call succeeded; the content Claude left is then fingerprinted (SHA-256) once the tool result has gone back, so the tool is never slowed down.
- Snapshots live in session state (they survive a hot reload of the mod, not a new session). Limits: 20 snapshots per file, 50 MB in all (2000 snapshots at most), oldest dropped first. Files over 1 MB, and files that are not UTF-8 text, are not snapshotted; `/undo list` and the pane name them.
- Undo restores the latest snapshot of a file and removes it, so repeated undos walk back through the history. A file that did not exist before is deleted instead.
- Safety checks:
  - if the file changed since Claude's last edit (someone else touched it), the restore is refused unless you add `force`;
  - a file Claude created is deleted only while its content is still exactly what Claude wrote; `force` does not override that;
  - every undo is two-step, and only ever runs from your command or button, never automatically;
  - a confirm undoes exactly the snapshot its preview described: if Claude edited the file again in between, nothing is undone and a fresh preview is shown.
- Subagent edits are not snapshotted.

## Commands
| Command | Effect |
|---|---|
| `/undo` | Opens a pane listing the files with snapshot count and last change. Each row has an `Undo` button: first press shows what will happen (`Confirm undo?`), second press does it. A refused restore offers `Force undo`, also two-step. |
| `/undo <path>` | Shows what undoing that file will do. The path is relative to the session folder, or absolute. |
| `/undo <path> confirm` | Does it (only after the preview above, for the same path). |
| `/undo <path> force` then `/undo <path> force confirm` | Restores even though the file changed since Claude's edit. |
| `/undo list` | Files, snapshot counts, total size, and the files that were not snapshotted. |
| `/undo clear` | Drops every snapshot of the session. |
| `/undo close` | Closes the pane. |

A toast reports each undo.

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/edit-undo
```

## Limits
- Only the tools `Edit`, `Write` and `NotebookEdit` are watched: files changed through `Bash` (`sed -i`, `git checkout`, a formatter) are not snapshotted, though such a change is detected as "changed since Claude's edit".
- Snapshots are per session: a new session starts empty.
- Files are read as UTF-8 text; binary or non-UTF-8 files are skipped rather than risk writing them back damaged.
- A file of a path ending in ` confirm` or ` force` must be quoted: `/undo "notes force" confirm`.
- File permissions are not snapshotted: a restore rewrites the content only.

## Develop

```sh
claude plugin validate mods/edit-undo
claude plugin test mods/edit-undo   # 26 tests
```
