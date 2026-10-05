# rm-guard

Makes destructive `Bash` commands ask for your confirmation instead of running silently.

## What it does
- Checks each `Bash` call through the permission system (`tool.check`) and turns it into an "ask" prompt when it matches. A command already denied stays denied.
- Matches, per simple command (split on `&&`, `||`, `;`, `|`, `&`, newlines):
  - `rm` with both recursive and force flags, unless every target is under `/tmp/` or `/private/tmp/` (no target also asks, e.g. `xargs rm -rf`);
  - `git reset --hard`, `git clean -f` (not with `-n`/`--dry-run`), `git checkout .`, `git restore .` (not when only `--staged`);
  - `find ... -delete`, and `find -exec`/`-execdir` running a destructive command;
  - `mkfs*`, `dd of=/dev/...`;
  - `DROP TABLE|DATABASE` and `TRUNCATE` when a SQL client (`psql`, `sqlite3`, `mysql`, `mariadb`, `duckdb`, `sqlcmd`) appears in the command.
- Wrappers are looked through: `sudo`, `env`, `rtk`, `nohup`, `time`, `nice`, `xargs`, `sh`/`bash`/`zsh`, `eval`, `command`.

## Commands
| Command | Effect |
|---|---|
| `/rm-guard status` | Show whether the guard is on. |
| `/rm-guard off` | Stop asking for this session; status line shows `rm-guard: OFF`. |
| `/rm-guard on` | Turn it back on. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/rm-guard
```

## Limits
- Reads the command line word by word: it does not see through `$(...)`, aliases, scripts or `bash -c` with complex quoting. A seatbelt, not a security boundary.
- The prompt goes through the permission system: in `auto`/`bypassPermissions` mode the mode settles the question.
- `rm -r` without `-f` is allowed (it still prompts on write-protected files).

## Develop
```sh
claude plugin validate mods/rm-guard
claude plugin test mods/rm-guard   # 86 tests
```
