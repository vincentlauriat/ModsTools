# auto-context

Gives Claude a short, always-fresh picture of the repository state without having to ask for it.

## What it does
- Adds a session section to the system prompt:
  - git branch, with `ahead`/`behind` counts when non-zero
  - number of uncommitted files
  - last commit subject
  - up to 5 open (`- [ ]`) items of `TODOS.md`: those under a `## Next` heading, otherwise the first open items anywhere in the file
- Computed at session start and refreshed after each main turn (cached between turns).
- Nothing is injected outside a git repository without a `TODOS.md` containing open items.

## Commands
| Command | Effect |
|---|---|
| `/auto-context` | Shows the text currently injected |
| `/auto-context off` | Stops injecting (kept across sessions) |
| `/auto-context on` | Resumes injecting and refreshes |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/auto-context
```

## Limits
- The section reflects the state as of the last completed turn, not live changes made since.
- Git and `TODOS.md` are read from the session folder only.

## Develop

```sh
claude plugin validate mods/auto-context
claude plugin test mods/auto-context   # 9 tests
```
