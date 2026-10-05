# commit-size-guard

Asks before a `git commit` or `git add` sweeps into git things that should not be there: large files, big binaries, build and release artifacts.

## What it does
- Checks each `Bash` call through the permission system (`tool.check`). A `git commit` or `git add` that would include an offending file becomes an "ask" prompt; it never denies, and a command already denied stays denied.
- Finds git through `rtk`, `env`, `sudo`, `VAR=value` prefixes, a `cd <dir> &&` before it and `git -C <dir>` / `-c key=value`.
- For `git commit`: lists the staged files with `git diff --cached --numstat -z`, and for `-a`/`--all` (also inside clusters such as `-am`) the modified tracked files with `git diff --numstat -z`. Deletions are left out. Sizes come from the working tree (`stat`), or from the staged blob (`git cat-file -s`) when the file is no longer there.
- For `git add`: the paths named on the line (even ignored ones, for `git add -f`), the untracked files the pathspec covers (`git ls-files --others --exclude-standard -z`; the whole repository for `-A` without a path) and the modified tracked files under it. `-n`/`--dry-run` is not checked.
- Asks when a file:
  - is larger than `maxMB` (default 5 MB);
  - is binary (numstat shows `-` `-`) and larger than 1 MB;
  - is a build or release artifact: `*.dmg`, `*.zip`, `*.ipa`, anything inside a `*.app/` or `*.xcarchive` bundle, `DerivedData/`, `node_modules/` or `.build/`, or any file under the repository's top-level `release/` folder except `*.md` release notes.
- The prompt lists up to 5 offenders with their sizes (an artifact folder counts once, with its number of files) and suggests `.gitignore` and `git restore --staged`.
- Reads only machine formats (`-z`, numstat, `cat-file -s`), so a localised git or RTK's output rewriting do not change the result.
- Each git call has a 5 second timeout; when git fails, times out or is not a repository, the engine's own decision stands.

## Commands
| Command | Effect |
|---|---|
| `/commit-size-guard status` | Shows whether the guard is on and the limits. |
| `/commit-size-guard off` | Stops asking, kept across sessions; status line shows `commit-size-guard: OFF`. |
| `/commit-size-guard on` | Turns it back on. |

## Settings
| Option | Default | Meaning |
|---|---|---|
| `maxMB` | `5` | A file larger than this many MB asks first. |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/commit-size-guard
```

## Limits
- `git commit <path>` / `--only` / `--include` commit working-tree content of the named paths: only what is staged (and `-a`) is checked.
- Reads the command line word by word: it does not see through `$(...)`, aliases, scripts or `bash -c` with complex quoting.
- Sizes come from the working tree first: a partially staged file is sized as it stands on disk.
- A git listing over 4 MiB (what one process run keeps) is checked up to its last whole entry, and the prompt says the list was cut off.
- At most 500 files are sized per check (an un-ignored `node_modules` can hold thousands); beyond that only the path patterns apply.
- The prompt goes through the permission system: in `auto`/`bypassPermissions` mode the mode settles the question.

## Develop

```sh
claude plugin validate mods/commit-size-guard
claude plugin test mods/commit-size-guard   # 24 tests
```
