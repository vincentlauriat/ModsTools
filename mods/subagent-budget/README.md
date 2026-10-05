# subagent-budget

Notices when one turn fans out into more subagents than you meant to pay for.

## What it does
- Counts the subagents started during each main turn (`agent.spawn` events that actually started an agent; denied spawns are not counted).
- The count resets when a prompt starts a new turn; a prompt delivered into a running turn does not reset it.
- When the count goes over the budget (10 by default), toasts once for that turn:
  `subagent-budget: N subagents this turn (budget M)`
- Keeps today's highest per-turn count across sessions (`$.store`), saved at the end of each main turn and when a new prompt starts a turn (never from concurrent spawns, so parallel spawns cannot make it go backwards).
- The per-turn count lives in the session state, so it survives a hot reload.

### Which spawns are seen
`agent.spawn` fires for every agent the Agent tool starts, so all of these count toward the current turn:
- spawns by the main conversation
- nested spawns, made by a subagent (`parentAgentId` set)
- teammates (`isTeammate`)
- spawns made by plugins through `$.agent.spawn`

The engine's own internal forks (compaction, memory) are not Agent-tool spawns; whether they fire `agent.spawn` is not verified.

## Commands
| Command | Effect |
|---|---|
| `/subagent-budget` | Shows this turn's count, today's max per turn and the budget |
| `/subagent-budget off` | Stops the toast (counting continues; kept across sessions) |
| `/subagent-budget on` | Brings the toast back |

## Settings
| Option | Default | Effect |
|---|---|---|
| `max` | 10 | Subagents allowed per turn before the toast |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/subagent-budget
```

## Limits
- No status line and no blocking: it only informs.
- Background subagents still running when the next prompt is typed are counted in the turn that spawned them, not the next.
- Today's max uses the local calendar day.
- The reset rule relies on `prompt.submit`'s `turnId`: if a prompt typed during a turn were reported with a `turnId` yet started its own turn, that turn would carry the previous count over (not verified against a live session).

## Develop

```sh
claude plugin validate mods/subagent-budget
claude plugin test mods/subagent-budget   # 12 tests
```
