# deriveddata-janitor

Finds Xcode DerivedData folders whose workspace no longer exists (removed git worktrees...) and deletes them on explicit request.

## What it does
- Scans `~/Library/Developer/Xcode/DerivedData` at session start: for each folder it reads `WorkspacePath` from `info.plist` (via `plutil`) and flags it as an orphan when that path is gone. Sizes come from `du -sk`.
- Status line: `DerivedData: 3 orphans · 2.4 GB` (hidden when there are none).
- After a successful `git worktree remove` run by the main agent, rescans and shows a toast for newly orphaned folders.
- Never deletes anything on its own: only `/deriveddata-janitor clean` removes folders.

## Commands
| Command | Effect |
|---|---|
| `/deriveddata-janitor` or `status` | Rescan and list orphans, largest first, with their former workspace |
| `/deriveddata-janitor clean` | Rescan, re-check each folder, delete the orphans, report freed space and skipped folders |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/deriveddata-janitor
```

## Limits
- Workspaces under `/Volumes/` and relative workspace paths are never judged (the disk may just be unmounted).
- Xcode's shared caches (`*.noindex`) and hidden entries are never touched; `clean` only removes a direct child of the DerivedData folder and re-verifies it is still orphaned.
- macOS only (needs `plutil`, `du`); requires `HOME` to be set.
- The toast only follows `git worktree remove` commands run by the main agent.

## Develop

```sh
claude plugin validate mods/deriveddata-janitor
claude plugin test mods/deriveddata-janitor   # 13 tests
```
