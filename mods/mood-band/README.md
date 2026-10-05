# mood-band

An optional one-line mascot above the prompt whose mood follows how the last turn went.

## What it does
- Off by default. When on, shows a dim band such as `(^‿^) Tout roule` after the first main-agent turn.
- Mood, by priority:

| Face | Caption | When |
|---|---|---|
| `(-_-) zzz` | Je dors | 30 minutes or more since the last turn |
| `(╥﹏╥)` | Ça a coincé | Turn errored or was aborted, or more than half of its tool calls failed or were denied |
| `(•_•;)` | Aïe | At least one tool call failed or was denied |
| `(•̀ᴗ•́)` | Ça chauffe | Turn lasted 2 minutes or more |
| `(^‿^)` | Tout roule | Otherwise |

## Commands
| Command | Effect |
|---|---|
| `/mood` | Reports whether the band is on |
| `/mood on` / `off` | Shows / hides the band (kept across sessions) |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/mood-band
```

## Limits
- Captions are in French and not configurable.
- Only main-agent tool calls are counted; subagents are ignored.

## Develop

```sh
claude plugin validate mods/mood-band
claude plugin test mods/mood-band   # 12 tests
```
