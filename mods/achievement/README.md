# achievement

Playful badges, each unlocked once ever, from real events in your sessions.

## What it does
- Watches tool calls, main-agent turns and subagent spawns; shows a `🏆 Achievement unlocked: <name>` toast on unlock. Progress is persistent across sessions.
- Badges:

| Badge | Unlocked by |
|---|---|
| First Blood | First tool call |
| Centurion | 100 Bash commands |
| Wordsmith | 50 Edit calls |
| Night Owl | Finishing a turn between 0:00 and 5:00 |
| Early Bird | Finishing a turn between 5:00 and 7:00 |
| Marathon | A single turn of 10 minutes or more |
| Subagent Wrangler | 5 subagents spawned in one session |
| Green Light | A passing test command (`npm test`, `pnpm test`, `yarn test`, `vitest`, `jest`, `pytest`, `cargo test`, `go test`, `swift test`, `claude plugin test`) |
| Persistent | A Bash command that failed earlier now succeeds |
| Shipper | A successful `git push` |
| Clean Slate | `git status` showing a clean working tree |

## Commands
| Command | Effect |
|---|---|
| `/achievements` | Lists unlocked badges and hints for the locked ones |
| `/achievements reset` | Clears all progress |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/achievement
```

## Limits
- Failures are detected from the Bash result's error flag; only the last 30 failed commands are remembered for Persistent.
- Clean Slate recognises English and French `git status` output and rtk's compacted form.
- Denied tool calls count for nothing.

## Develop

```sh
claude plugin validate mods/achievement
claude plugin test mods/achievement   # 14 tests
```
