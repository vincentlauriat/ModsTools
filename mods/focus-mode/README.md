# focus-mode

A minimal pomodoro timer inside Claude Code.

## What it does
- `/focus` starts a countdown; a dim band above the prompt shows `🎯 Focus N min left`, updated every minute.
- When time is up: a toast `Focus done — take a break` and a band with a Dismiss button.

## Commands
| Command | Effect |
|---|---|
| `/focus` | Starts 25 minutes (or reports the time left if a focus is running) |
| `/focus <minutes>` | Starts a focus of 1 to 480 minutes |
| `/focus stop` | Cancels the countdown |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/focus-mode
```

## Limits
- Resolution is one minute; the remaining time never displays below 1 min.
- A hot reload in the middle of a countdown delays the end toast.

## Develop

```sh
claude plugin validate mods/focus-mode
claude plugin test mods/focus-mode   # 7 tests
```
