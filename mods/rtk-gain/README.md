# rtk-gain

Shows the tokens saved by RTK (Rust Token Killer) in the status line.

## What it does
- Runs `rtk gain --format json` at session start and shows `rtk −19.3M tok (50%)` (total tokens saved, average savings percent when reported).
- Refreshes after a main-conversation turn when at least 5 minutes have passed since the last refresh.
- Clears the status line when `rtk` is missing, times out (15 s) or returns unparseable output.

## Commands
| Command | Effect |
|---|---|
| `/rtk-gain` | Refreshes the status line and prints the full `rtk gain` report |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/rtk-gain
```

## Limits
- Requires the `rtk` binary on `PATH`; otherwise the status line stays empty and `/rtk-gain` says it is unavailable.
- Figures are RTK's global totals, not per session.
- Relies on the JSON shape `{ summary: { total_saved, avg_savings_pct } }`.

## Develop

```sh
claude plugin validate mods/rtk-gain
claude plugin test mods/rtk-gain   # 11 tests
```
