# agent-tracker

A pane listing the subagents launched during the session, with status and duration.

## What it does
- Records each subagent when it starts (foreground or background; teammates are skipped), labelled `type: description`.
- Marks it `⏳` running, `✓` done (its turn ended with an answer) or `✗` failed (interrupted, API error, refusal...), with its duration (`42s`, `3m05s`).
- The pane header counts agents and running ones; newest agent first, as many rows as fit.

## Commands
| Command | Effect |
|---|---|
| `/agent-tracker` | Open the pane |
| `/agent-tracker close` | Close the pane |
| `/agent-tracker clear` | Remove finished agents, keep running ones |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/agent-tracker
```

## Limits
- A subagent stopped without finishing its turn stays `⏳`.
- The list lives in memory for the session; only subagents spawned after the mod loaded are tracked.

## Develop

```sh
claude plugin validate mods/agent-tracker
claude plugin test mods/agent-tracker   # 9 tests
```
