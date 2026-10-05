# tool-heatmap

A pane showing which tools Claude calls most, and which of them fail.

## What it does
- Counts every tool call, main conversation and subagents together.
- A call counts as a failure when it is denied or returns an error.
- The pane (opened at session start) shows a summary line (`N calls · N failed · N tools`), then one row per tool sorted by call count: name, a `█` bar scaled to the top tool, the count, and `(N✗)` when there are failures.

## Commands
| Command | Effect |
|---|---|
| `/tool-heatmap` | Open the pane and print the totals. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/tool-heatmap
```

## Limits
- Counts are per session and not reset by a command; there is no close or clear subcommand.
- Tool names are cut to 20 characters; rows beyond the pane height are not shown.
- A call counts when it completes (or is denied): calls still running are not included.

## Develop
```sh
claude plugin validate mods/tool-heatmap
claude plugin test mods/tool-heatmap   # 8 tests
```
