# ascii-weather

Current weather in the status line, from wttr.in.

## What it does
- At session start and after a main turn at least one hour after the last fetch, runs `curl` against wttr.in (metric units, 5 s timeout) and shows e.g. `☀️ Paris +21°C` in the status line.
- With an empty `location`, wttr.in guesses from your IP and the city is left out of the display (coordinates are filtered).
- On any failure the status line entry is cleared; no retry before the next hour.

## Commands
| Command | Effect |
|---|---|
| `/weather` | Fetches and shows the one-line forecast for the configured location |

## Options
| Field | Type | Default | Meaning |
|---|---|---|---|
| `location` | string | `""` | City or place name for wttr.in; empty = guess from IP |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/ascii-weather
```

## Limits
- Makes a network call to wttr.in (with your IP when `location` is empty); the only mod of the fun set that does.
- Answers that look like errors or are longer than 100 characters are discarded.
- Needs `curl` on the PATH.

## Develop

```sh
claude plugin validate mods/ascii-weather
claude plugin test mods/ascii-weather   # 11 tests
```
