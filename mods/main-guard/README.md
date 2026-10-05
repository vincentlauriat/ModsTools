# main-guard

Refuses risky git and release commands (pushes to `main`/`master`, force pushes, tags, GitHub releases) until you allow them.

## What it does
- Inspects every `Bash` call before it runs and denies it with an explanation to Claude, plus a toast for you.
- Refused:
  - `git push` to `main` or `master` (explicit refspec, `HEAD:main`, or a bare `git push` while on that branch);
  - force pushes (`-f`, `--force*`, `+refspec`);
  - `git push --mirror` / `--all`;
  - pushing tags (`--tags`, `--follow-tags`, `tag <name>`, `refs/tags/...`);
  - creating or deleting tags with `git tag` (listing options such as `-l`, `--list`, `--contains` are allowed);
  - `gh release create`, `edit` and `delete`.
- `git -C <dir>` and a preceding `cd <dir>` are used to find the branch of a bare push; `rtk` prefixes and env assignments are skipped.

## Commands
| Command | Effect |
|---|---|
| `/main-guard status` | Show whether the guard is on. |
| `/main-guard off` | Allow everything for this session; the status line shows `main-guard: OFF`. |
| `/main-guard on` | Turn the guard back on. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/main-guard
```

## Limits
- The command line is read word by word, split on `&&`, `||`, `;`, `|` and newlines. It does not see through `bash -c "..."`, `$(...)`, `eval`, aliases or scripts, nor quoted text containing `;` or `|`.
- This is a seatbelt against accidental pushes, not a security boundary.
- The off switch lasts for the session (stored as a session atom).

## Develop
```sh
claude plugin validate mods/main-guard
claude plugin test mods/main-guard   # 40 tests
```
