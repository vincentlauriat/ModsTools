# command-history

A pane listing the Bash commands the main conversation ran, with outcome and duration.

## What it does
- Records each `Bash` call of the main conversation (subagent calls are ignored).
- Each row: `<status> <command> · <duration>`, newest first, first line of the command only, cut to the pane width.
- Status: `✓` success, `✗ N` non-zero exit code (read from the `Exit code N` error text), `✗` error without a code, `denied`, `interrupted`.
- Durations show as `340ms` or `2.4s`. Only the last 50 commands are kept.
- The pane is not opened automatically: run the command.

## Commands
| Command | Effect |
|---|---|
| `/command-history` | Open the pane. |
| `/command-history close` | Close it (`off` also works). |
| `/command-history clear` | Empty the history. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/command-history
```

## Limits
- Exit codes come from Bash's error text; a failure without that text shows plain `✗`.
- History is per session and capped at 50 entries.
- Multi-line commands show only their first line.

## Develop
```sh
claude plugin validate mods/command-history
claude plugin test mods/command-history   # 6 tests
```
