# streak

Counts consecutive days on which you completed at least one turn.

## What it does
- Records the local calendar day after each completed main-agent turn; the day list is kept across sessions (last 400 days).
- Status line: `🔥 N-day streak` (`🔥 1 day` for a single day); hidden when the streak is 0.
- A streak stays alive if its last day is today or yesterday.
- Toast `🔥 N-day streak!` when a turn crosses 7, 30, 100 or 365 days.

## Commands
| Command | Effect |
|---|---|
| `/streak` | Shows current streak, longest streak and total active days |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/streak
```

## Limits
- Days follow the local clock and time zone of the machine.
- Only the last 400 active days are stored, so a longest streak beyond that is truncated.

## Develop

```sh
claude plugin validate mods/streak
claude plugin test mods/streak   # 13 tests
```
