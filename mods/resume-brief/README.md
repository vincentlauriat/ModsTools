# resume-brief

Gives Claude a short "where we left off" brief from the project's working journals, so "resume" / "reprends" works reliably in a new session. Complements `auto-context` (git state and `TODOS.md`), which it does not duplicate.

## What it does
- Adds one session section, last in the system prompt (at most 30 lines), built from whichever of these files exist in the session folder:
  - `COMMANDS.md`: the last 3 `## N — date` entries (each cut to 200 characters)
  - `MEMORY.md`: the last 4 bullets of its `## State` section (300 characters each)
  - `PLAN.md`: the `## Phase …` headings marked 🟡, with their 🟡/⬜ sub-bullets (8 lines max)
  - `CHANGES.md`: the last 5 non-empty lines
- Computed at session start and refreshed after each main turn (the journals change during a session); compose only reads the cache.
- Nothing is injected when none of the files has usable content.

## Commands
| Command | Effect |
|---|---|
| `/resume-brief` | Shows the brief currently injected |
| `/resume-brief off` | Stops injecting (kept across sessions) |
| `/resume-brief on` | Resumes injecting and refreshes |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/resume-brief
```

## Limits
- Expects the journal formats above (`## N — date` headings in `COMMANDS.md`, a `## State` section in `MEMORY.md`, 🟡/⬜ markers in `PLAN.md`); other layouts yield nothing for that file.
- The brief reflects the files as of the last completed turn.
- Files are read from the session folder only.

## Develop

```sh
claude plugin validate mods/resume-brief
claude plugin test mods/resume-brief   # 14 tests
```
