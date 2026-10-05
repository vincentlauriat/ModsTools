# cost-meter

Keeps the session cost and your most used rate-limit window in the status line, and warns once when the cost passes a threshold.

## What it does
- Status line such as `$1.23 · 5h 42%`: session cost in USD plus the rate-limit window with the highest usage (`5h`, `7d`, `spend`, or the raw kind name). Parts that are unavailable are left out; nothing is shown if both are.
- Refreshed at session start and after each main-conversation turn.
- Shows a toast once per session (`Session cost passed $5: now $5.42`) the first time the cost reaches the threshold.

## Commands
| Command | Effect |
|---|---|
| `/cost-meter` | Prints the cost, every rate-limit window (percent used, reset time when known) and the session duration |

## Options
| Field | Type | Default | Meaning |
|---|---|---|---|
| `thresholdUsd` | number | `5` | Toast once when the session cost crosses this amount (USD) |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/cost-meter
```

## Limits
- Figures come from the session's usage data; when the cost is not available the status line shows only the rate limit and `/cost-meter` prints `Cost: not available`.
- The threshold alert fires once per session and is not re-armed.

## Develop

```sh
claude plugin validate mods/cost-meter
claude plugin test mods/cost-meter   # 6 tests
```
