# session-journal

A cross-session journal of what you worked on, per project and per day.

## What it does
- After each main-agent turn, stores one entry: time, project (session folder name), first line of the prompt (truncated to 80 characters), number of tool calls, number of distinct files edited (Edit, Write, NotebookEdit).
- Subagent turns and denied tool calls are not counted.
- Entries older than 30 days are dropped; at most 2000 are kept. Storage is persistent across sessions.

## Commands
| Command | Effect |
|---|---|
| `/journal` | Today's entries, grouped by project |
| `/journal yesterday` | Yesterday's entries |
| `/journal week` | Turn counts per day and project over the last 7 days |
| `/journal clear` | Deletes the whole journal |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/session-journal
```

## Limits
- Read-modify-write on the store: two sessions finishing a turn at the same moment may lose an entry.
- A turn started by a slash command may be logged as `(no prompt)`.

## Develop

```sh
claude plugin validate mods/session-journal
claude plugin test mods/session-journal   # 10 tests
```
