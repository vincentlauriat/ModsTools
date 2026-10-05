# je-coupe

End-of-session ritual: typing "je coupe" asks Claude to bring every doc file of the project up to date, and tracks which ones are still untouched.

## What it does
- On prompt submit: if the prompt is "je coupe" (case, accents and punctuation ignored; text after it is allowed, e.g. "je coupe pour ce soir"), scans the session folder for `COMMANDS.md`, `CHANGES.md`, `MEMORY.md`, `TODOS.md`, `PLAN.md`, `README.md`, `ARCHITECTURE.md`, `ARCHITECTURE_EN.md`.
- Rewrites the prompt by appending an instruction listing the docs found; those not modified since the session started are flagged `(NOT modified this session)`.
- Shows a band above the prompt (`Je coupe: N docs not updated yet: …`) with a Dismiss button. The band is re-evaluated after each main turn and disappears once every doc is newer than the session start.
- Does nothing if none of the doc files exist in the folder.

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/je-coupe
```

## Limits
- Staleness is judged by file modification time against the session start: a doc touched by anything else counts as updated.
- Only the exact trigger "je coupe" (optionally followed by more words) is recognised; the doc list is fixed.

## Develop

```sh
claude plugin validate mods/je-coupe
claude plugin test mods/je-coupe   # 10 tests
```
