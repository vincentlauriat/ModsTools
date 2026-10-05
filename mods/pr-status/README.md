# pr-status

A status line for the pull request of the current branch: checks, review decision and merge state.

## What it does
- Runs `gh pr view --json number,state,isDraft,reviewDecision,statusCheckRollup,mergeable,title,url` in the session folder (10 s timeout) and shows one status entry:
  - `PR #12 ✓ checks · approved`
  - `PR #12 ✗ 2 checks · changes requested`
  - `PR #12 ⏳ checks`
  - `PR #12 draft`, `PR #12 merged`, `PR #12 closed`
  - `review required` and `conflicts` are appended when they apply.
- No PR for the branch, not a git repository, `gh` missing or not logged in, timeout: the status is cleared.
- Refreshes at session start, after each main-conversation turn at most every 5 minutes, and immediately after a successful Bash `gh pr create|merge|ready|review` or `git push`.

## Commands
| Command | Effect |
|---|---|
| `/pr-status` | Refresh and print title, URL, status line, each failing check name and the pending ones. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/pr-status
```

## Limits
- Needs the GitHub CLI (`gh`), authenticated for the repository.
- Pushes made outside Claude are only picked up at the next turn once 5 minutes have passed.
- A check counts as failing on `FAILURE`, `TIMED_OUT`, `CANCELLED`, `STARTUP_FAILURE`, `ACTION_REQUIRED`, `STALE` or `ERROR`; `SUCCESS`, `NEUTRAL` and `SKIPPED` count as passed.
- Merged and closed PRs show no check detail.

## Develop
```sh
claude plugin validate mods/pr-status
claude plugin test mods/pr-status   # 16 tests
```
