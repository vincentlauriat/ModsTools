# doc-sync-guard

A band above the prompt that warns when a turn left your project's journal or changelog out of date.

## What it does
- Active only in a folder that has `COMMANDS.md` and/or `CHANGES.md`; otherwise silent.
- At the end of each main-conversation turn (not subagents, not aborted turns) it compares file modification times with the turn's start:
  - `COMMANDS.md` exists but was not modified this turn: flagged.
  - `CHANGES.md` exists, was not modified, and code changed this turn: flagged.
- "Code changed" means a successful `Edit`/`Write`/`NotebookEdit` on a non-`.md` file, or (for Bash) a modified/untracked non-`.md` file in the git repo with a modification time within the turn.
- Shows `⚠ Not updated this turn: COMMANDS.md, CHANGES.md` with a Dismiss button, plus a toast. The warning resets when you submit the next prompt.

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/doc-sync-guard
```

## Limits
- File names are fixed (`COMMANDS.md`, `CHANGES.md`) and looked up in the session folder only.
- Edits to `.md` files never count as code changes.
- The Bash/git check is skipped when more than 500 files are dirty, and relies on file modification times.
- It only warns; it does not edit anything.

## Develop
```sh
claude plugin validate mods/doc-sync-guard
claude plugin test mods/doc-sync-guard   # 4 tests
```
