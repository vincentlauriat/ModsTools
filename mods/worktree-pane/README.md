# worktree-pane

A pane listing the git worktrees of the session folder, each with its Xcode DerivedData, and a two-step button that removes a worktree together with its DerivedData.

## What it does
- `/worktrees` opens a "Worktrees" pane (never opens by itself). Each row shows the path (relative to the main worktree or under `~`), the branch or `detached`, a `main` marker, `locked`, `prunable`/`missing` flags, the number of dirty files, and the DerivedData folders (count and size) whose workspace lives inside that worktree.
- Every worktree except the main one has a **Remove** button. The first press turns it into **Confirm remove?** for that row; the second press runs `git worktree remove <path>` (no `--force`). Any other press or a refresh resets the confirmation.
- If git refuses (for instance a dirty worktree), its message is shown in the pane and nothing is deleted. Only after git succeeded are the worktree's DerivedData folders deleted, then the pane refreshes and a toast reads `Removed <name> + N DerivedData (X GB)`.
- Outside a git repository the pane says `not a git repository`.

## Commands
| Command | Effect |
|---|---|
| `/worktrees` | Reload and open the pane |
| `/worktrees refresh` | Reload and reset any pending confirmation |
| `/worktrees close` | Close the pane |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/worktree-pane
```

## Limits
- The main worktree is never removed. A folder is only deleted if it is a direct child of `~/Library/Developer/Xcode/DerivedData`, is not an Xcode cache (`*.noindex`), and its `info.plist` still points inside the removed worktree.
- DerivedData belongs to the deepest worktree containing its workspace path (a worktree nested in the main one is not counted for main).
- Locked worktrees are refused by git and reported as such.
- macOS only (needs `plutil`, `du`); requires `HOME` to be set for the DerivedData part.

## Develop

```sh
claude plugin validate mods/worktree-pane
claude plugin test mods/worktree-pane   # 17 tests
```
