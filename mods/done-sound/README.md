# done-sound

Plays a short chime when a long turn finishes, so you can look away while Claude works.

## What it does
- Measures each main-agent turn from prompt submit to completion.
- Plays the bundled original chime (`sounds/done.wav`) when the turn lasted at least `minSeconds`.
- Subagent turns never trigger it.

## Commands
| Command | Effect |
|---|---|
| `/done-sound off` / `on` | Disable / enable the chime (default on) |
| `/done-sound test` | Plays the chime now; reports if audio is unavailable |

## Options
| Field | Type | Default | Meaning |
|---|---|---|---|
| `minSeconds` | number | `30` | Minimum turn length, in seconds, for the chime to play |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/done-sound
```

## Limits
- A hot reload in the middle of a turn skips the sound for that turn.
- If the host has no audio output, playback fails silently (`/done-sound test` tells you).

## Develop

```sh
claude plugin validate mods/done-sound
claude plugin test mods/done-sound   # 6 tests
```
