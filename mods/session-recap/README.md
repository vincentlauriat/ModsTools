# session-recap

A one-glance summary of what the session did, as a pane or as Markdown you can copy into a PR, a journal or a hand-off note.

## What it does
- Tracks, for the main conversation (subagent tool calls are ignored):
  - **files changed**: distinct paths of successful `Edit`, `Write` and `NotebookEdit` calls, relative to the session folder
  - **commits**: each successful Bash `git commit` (also behind `rtk`, `-C dir` or a preceding `cd dir &&`), read back with `git log -1 --format=%h %s` in that folder; the `-m` subject is used when git cannot answer
  - **pull requests**: successful `gh pr create` / `gh pr merge`, with the number and URL taken from a `…/pull/N` link in the command or its output
  - **tests & builds**: runs of npm/pnpm/yarn test, vitest, jest, pytest, cargo test, go test, swift test, xcodebuild, tsc and `claude plugin test`, counted as passed or failed by the command's exit status
- Commands are recognised behind `rtk` (including `rtk proxy|test|err|summary`), `npx` and its `-y`/`-p <pkg>` flags, `sudo`, `time`, `env` and `VAR=value` prefixes.
- Bash calls run with `run_in_background` are ignored: they return before the command ends, so there is no exit status yet and a commit may not have landed.
- Adds the session duration and cost (`$.session.usage()`).
- The data lives in the session state, so it survives a hot reload of the mod.

## Commands
| Command | Effect |
|---|---|
| `/recap` | Opens the recap pane |
| `/recap text` | Prints the recap as Markdown (copyable command output) |
| `/recap close` | Closes the pane |
| `/recap clear` | Empties the tracked data |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/session-recap
```

## Limits
- Pass/fail is per command run (exit status), not per test case: test-runner output is never parsed, since it may be localised or rewritten by RTK.
- A command chaining several checks counts each of them with the command's single exit status.
- Commands are classified by their text: a commit made by a script or an alias is not seen. A Bash `cd` from an earlier call is not tracked; commits run in the session folder unless the same command says otherwise.
- Only the first `git commit` of a chained command is recorded.
- Only what happens after the mod loads is tracked.

## Develop

```sh
claude plugin validate mods/session-recap
claude plugin test mods/session-recap   # 13 tests
```
