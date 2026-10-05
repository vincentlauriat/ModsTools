# turn-timer

A small band above the prompt showing how long the last turn took and how many tools it called.

## What it does
- After each main-conversation turn (not subagents), shows `⏱ last turn 42s · 12 tools` above the prompt. Durations over a minute read `1m05s`.
- Tool count includes every tool call since you submitted the prompt (subagents' calls too).
- A **Hide** button dismisses the band; it reappears after the next turn.
- Toast `Slow turn: <duration>, N tool calls` when a turn lasts more than 2 minutes.
- Uses the turn's reported duration, falling back to the clock since prompt submission.

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/turn-timer
```

## Limits
- No command and no options: the 2-minute toast threshold is fixed in the code.
- Nothing is shown until a first turn has completed; state is not kept across sessions.
- The band is hidden while a survey is displayed.

## Develop
```sh
claude plugin validate mods/turn-timer
claude plugin test mods/turn-timer   # 6 tests
```
