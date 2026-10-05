# no-coauthor

Strips `Co-Authored-By: Claude` / `Anthropic` trailers from `git commit` commands before they run.

## What it does
- Intercepts each `Bash` call that contains a `git commit` and rewrites the command; the commit itself still runs.
- Removes trailers naming Claude or Anthropic (case-insensitive) from `-m`/`--message` arguments, `--trailer` arguments, and trailer lines inside multi-line messages or heredocs.
- Keeps `Co-Authored-By:` trailers for human co-authors.
- Shows a toast: `no-coauthor: removed N Claude co-author trailer(s) from the commit`.
- Commands without a trailer, or that are not commits, pass through unchanged.

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/no-coauthor
```

## Limits
- Text-based rewriting of the command line: trailers built through variables, files (`-F`, `--amend` without a new message), `git commit-tree` or scripts are not seen.
- No command and no on/off switch: remove the plugin to disable it.

## Develop
```sh
claude plugin validate mods/no-coauthor
claude plugin test mods/no-coauthor   # 21 tests
```
