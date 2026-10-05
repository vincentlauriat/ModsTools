# context-gauge

Warns you before the context window fills up, with a band above the prompt suggesting `/compact`.

## What it does
- Reads the context-window percentage at session start and after each main-conversation turn.
- From 70% it shows a band above the prompt: `Context 78% ▓▓▓▓▓▓▓▓░░ — consider /compact`, yellow from 70%, red from 90%.
- Shows nothing below 70%, when the percentage is unknown, or while a survey is displayed.

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/context-gauge
```

## Limits
- Refreshes at the end of a turn, not after `/compact` or a manual edit: the band can lag until the next turn.
- The 70% / 90% thresholds are fixed (no options).
- Informational only: it never compacts for you.

## Develop

```sh
claude plugin validate mods/context-gauge
claude plugin test mods/context-gauge   # 6 tests
```
