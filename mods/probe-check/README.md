# probe-check

Toasts when a Bash verification probe is misleading, before it can fool you.

## What it does
- Watches each `Bash` command of the main conversation (subagents are ignored). The command always runs untouched: probe-check never denies or rewrites.
- Shows a short toast per distinct pattern, once per turn, and keeps the last 10 findings.
- Patterns:
  - **pipe-status**: `$?` read right after a pipeline (`cmd | tail; echo $?`, `echo "exit=$?"`) reports the last stage, not `cmd`. Not flagged when `-o pipefail` appears earlier in the same command or `PIPESTATUS` is used.
  - **assign-pipe-status**: `x=$(a | b); echo $?`, same problem.
  - **git-grep-untracked**: a `git grep` (also `git -C <dir> grep`, after `rtk` or env prefixes) that printed nothing while `git status --porcelain --untracked-files=all` (limited to the pathspecs after `--`, run in the `-C` directory or the session's, 5 s timeout) lists untracked files: they were not searched. Checked after the command ran; silent when `git grep` matched, nothing is untracked, or `--untracked` / `--no-index` is used.
  - **grep-absent**: `grep … file || echo "not found"` with no existence check of the file: a missing file also triggers the message.
- Reading `$?` right after a simple command, or after `cmd > /dev/null 2>&1`, is fine.

## Commands
| Command | Effect |
|---|---|
| `/probe-check` or `/probe-check list` | Show the last 10 findings, newest first. |
| `/probe-check off` | Stop checking. |
| `/probe-check on` | Resume. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/probe-check
```

## Limits
- git-grep-untracked treats an empty stdout as "no match"; without `--` it checks the whole repository. If `git status` fails or times out, nothing is reported.
- Static text analysis otherwise: no shell expansion, no heredocs, no backtick substitutions, no `$?` read in a later pipeline segment or inside a function.
- Only the segment directly after the pipeline is inspected for `$?`.
- grep-absent is a heuristic: it counts non-option words after `grep` (at least a pattern and a path) and a `not found`-style `echo`.
- The on/off switch and the findings last for the session only.

## Develop
```sh
claude plugin validate mods/probe-check
claude plugin test mods/probe-check   # 25 tests
```
