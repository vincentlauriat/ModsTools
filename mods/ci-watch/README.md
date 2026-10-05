# ci-watch

Follows the GitHub Actions runs of a commit right after you (or Claude) push it, so a red build does not go unnoticed.

## What it does
- After a successful main-agent Bash `git push` (also behind `rtk`, `env`, `VAR=x`, `cd x &&` or `git -C x`), it reads the branch and `HEAD` sha of that folder and the push remote (`git push <remote>`, else the branch's remote, else `origin`), then polls `gh run list -R owner/repo --commit <sha> --json …` every 30 s.
- All of that runs deferred: the push result is never delayed.
- Status line while the runs go: `CI ⏳ 2 running`, then `CI ✓ 3 passed` or `CI ✗ 1 failed`.
- When every run is completed: a toast (`CI ✓ all 3 passed on main`, or `CI ✗ failed on main: Lint, Test — <first failed run URL>`). The final status line stays 10 minutes, then clears.
- Runs can take a few seconds to show up: it keeps asking for up to 2 minutes. If no run appears, it gives up silently (no workflow).
- It stops after 45 minutes at most. There is one watch per pushed sha: a push of another sha replaces it, and the same sha pushed again keeps it.
- Dry runs (`--dry-run`), deletes (`--delete`, `:branch`), backgrounded or failed pushes and subagent pushes are ignored.
- When `gh` is missing or not authenticated, or the remote is not on github.com, nothing is shown. `/ci-watch` says why.
- Success means `success`, `neutral` or `skipped`. Any other conclusion counts as failed.

## Commands
| Command | Effect |
|---|---|
| `/ci-watch` | Shows the watched commit and its runs with their URLs, or why nothing is watched |
| `/ci-watch stop` | Stops the current watch and clears the status line |
| `/ci-watch off` | Stops following pushes (kept across sessions) |
| `/ci-watch on` | Follows pushes again |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/ci-watch
```

## Limits
- The watched sha is the folder's `HEAD` after the push. A push of another ref (`git push origin other:main`) is followed under `HEAD`'s sha.
- A `cd` made in an earlier Bash call is not known. The folder is the session folder plus the `cd`/`-C` of the push command itself.
- Only github.com remotes (https, ssh, scp-like). GitHub Enterprise hosts are not followed.
- "All completed" means all runs listed at that moment. A workflow that starts later (for example via `workflow_run`) is not waited for.
- A hot reload of the mod (or a new session) drops a watch in progress: the timers go with the old module.

## Develop

```sh
claude plugin validate mods/ci-watch
claude plugin test mods/ci-watch   # 18 tests
```
