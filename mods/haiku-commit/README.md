# haiku-commit

Every commit deserves a poem: after each successful `git commit`, a three-line haiku about it pops up as a toast.

## What it does
- Watches the main agent's Bash calls for `git commit`, including behind `rtk`, `env`, `VAR=value`, `cd dir &&` and `git -C dir`.
- Reads `HEAD` before the command and again after it: a haiku is written only when `HEAD` moved, so failed, empty or no-op commits are ignored without reading git's (possibly localised) messages.
- Reads the new commit with `git show --numstat --format=%H%n%s HEAD` (a machine format, the same in every locale): subject, file count, insertions, deletions and the main file extension.
- Writes the haiku:
  1. **With a model first.** Mods can call a model (`$.model.complete`), so it asks `haiku` for a 5-7-5 haiku from the subject and stats (low effort, 120 tokens max, 8 s timeout). The reply is kept only if it is three short lines, each within two syllables of 5-7-5 by an approximate English counter.
  2. **From templates otherwise** (timeout, API error, refused model, a reply that is not a haiku): a deterministic haiku built from the commit type (`feat`, `fix`, `docs`, ...), the file count, the insertions/deletions balance and the main language, with variants chosen by hashing the commit hash, so the same commit always gets the same poem. The fragments are built to 5-7-5 (file phrases and language names carry explicit syllable counts, matched by tails of the right length) and the tests check every pool with the syllable counter.
- Toasts the three lines for 8 seconds and keeps the last haiku across sessions.

Example (template):

```
A new branch unfolds
two files moved by patient hands
the garden widens
```

## Commands
| Command | Effect |
|---|---|
| `/haiku-commit` | Shows the last haiku again, with the commit and whether a model or the templates wrote it |
| `/haiku-commit off` | Stops the haikus (kept across sessions) |
| `/haiku-commit on` | Resumes them |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/haiku-commit
```

## Limits
- The haiku is written after the Bash result is returned (deferred with `$.clock.after`), so commits are not slowed by the model; only the `HEAD` read before the command (a local `git rev-parse`) runs inline. The toast can arrive up to about 8 s after the commit when the model is slow.
- The model call is billed to the session's account like any other small request.
- Only commits run by the main agent's Bash tool are seen, not commits made in your own terminal or by subagents.
- Folders are resolved from the session folder plus `cd` / `-C` in the same command; a folder written with `~` is skipped.
- Syllable counts are approximate (English heuristics).
- A merge commit made with `git commit` after resolving conflicts has no `--numstat` lines, so it gets a "zero files" haiku.
- Where the transcript is printed into scrollback (no toast overlay), Claude Code shows a toast as one line on the notification bar, so the three lines may appear flattened there.

## Develop

```sh
claude plugin validate mods/haiku-commit
claude plugin test mods/haiku-commit   # 19 tests
```
