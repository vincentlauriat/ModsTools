# port-pane

Shows which local TCP ports your processes are listening on (dev servers, watchers, databases) and stops the ones started during the session, safely.

## What it does
- `/ports` opens a pane listing the TCP listeners you own, from `lsof -nP -iTCP -sTCP:LISTEN -F pcnL`, grouped by process: command, pid, ports, and the process's working folder (`lsof -a -p <pids> -d cwd -F n`, one call).
- Ports first seen after the session started are marked `●` and listed first. A snapshot is taken at session start and kept across hot reloads. The key is `pid:port`, so a server restarted on an old port counts as new.
- **Stop** (two-step confirm) sends `kill <pid>` (SIGTERM). After 3 s, if the process is still alive (`kill -0`), a toast says so and a **Force stop** button appears, behind its own two-step confirm, which sends `kill -9`.
- Before any signal, the pid is checked again against a fresh listing: same pid, same command, still listening.
- Stop is only offered for your own processes whose port was first seen during this session. **Allow stop** lifts that rule for a process that was already listening.
- Never stoppable, Allow stop or not: other users' processes, pids below 100, and a short deny list of system and desktop apps (launchd, ControlCenter, rapportd, Spotify, browsers…).
- Status line `🔌 N dev ports` counts the ports opened during this session. It refreshes after main turns, deferred, with a 5 s timeout.

## Commands
| Command | Effect |
|---|---|
| `/ports` | Opens the pane (refreshes the listing) |
| `/ports refresh` | Refreshes the listing |
| `/ports close` | Closes the pane |

## Options
| Field | Default | Effect |
|---|---|---|
| `statusLine` | `true` | Show `🔌 N dev ports` and refresh it after each main turn |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/port-pane
```

## Limits
- The plugin API gives a background Bash call a task id, not a pid. "Started during this session" therefore means "port first seen after the session-start snapshot", not "started by Claude".
- A process that closes its port but ignores SIGTERM drops out of the list, so Force stop is no longer offered for it.
- TCP listeners only (no UDP, no Unix sockets). macOS and Linux with `lsof`.

## Develop

```sh
claude plugin validate mods/port-pane
claude plugin test mods/port-pane   # 14 tests
```
