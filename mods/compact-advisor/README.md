# compact-advisor

Tells you when the context is nearly full and hands you a `/compact` line that keeps what matters.

## What it does
- After each main-conversation turn, reads the context percentage (`$.session.usage()`, free) and, when it crosses the threshold (85% by default), toasts once:
  `Context N% — /compact-advisor for a suggested /compact`
- The toast re-arms only after the percentage drops below threshold − 10 (typically after a `/compact`), so it does not repeat every turn.
- Tracks, in the session state (survives hot reload):
  - files edited by the main agent (`Edit`, `Write`, `NotebookEdit`, successful calls only)
  - the first line of the last prompt you typed (slash commands, notifications and plugin prompts are ignored)
- `/compact-advisor` prints a ready-to-paste line:
  `/compact Keep: branch <b>; files edited: a, b, c; open tasks: x | y | z; last decision/goal: <first line of the last prompt>`
  - branch from `git rev-parse --abbrev-ref HEAD` in the session folder
  - the 10 most recently edited files
  - up to 3 open `- [ ]` items of `TODOS.md` in the session folder, when present
  - parts with nothing to say are left out

No band is drawn: `context-gauge` already shows the percentage above the prompt.

## Commands
| Command | Effect |
|---|---|
| `/compact-advisor` | Prints the suggested `/compact` line |

## Settings
| Option | Default | Effect |
|---|---|---|
| `threshold` | 85 | Context percentage that triggers the toast |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/compact-advisor
```

## Limits
- The percentage is checked at the end of each main turn, not while a turn runs.
- Only the first open items of `TODOS.md` are taken, whatever section they are in.
- `;` inside tasks or the goal is turned into `,` so the line keeps its structure.

## Develop

```sh
claude plugin validate mods/compact-advisor
claude plugin test mods/compact-advisor   # 10 tests
```
