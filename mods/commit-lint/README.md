# commit-lint

Refuses `git commit` commands whose message subject is not a Conventional Commit.

## What it does
- Checks each `Bash` call containing `git commit` and denies it with the expected format when the subject does not match `type(scope)?!?: subject`, with type one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, a non-empty subject, and a header of at most `maxHeader` characters.
- Reads the message from `-m`/`--message` (the first `-m` is the subject, also in `-am`), from `-m "$(cat <<'EOF' ... EOF)"` heredocs (first line), and from `-F file`/`--file` (read relative to the session folder, or to the last `cd`/`git -C` folder; unreadable or `-` stdin: allowed).
- Looks through `rtk`, env assignments, `git -C`/`-c`, and chains such as `git add . && git commit -m "..."`.
- Allows commands without a message (`--amend --no-edit`, `-C`, `--reuse-message`, plain `git commit` opening an editor), merge commits (`Merge ...`), `fixup!`/`squash!` subjects and `Revert "..."` subjects, and subjects that are an unresolved `$(...)`/`$VAR`.

## Options
| Option | Default | Effect |
|---|---|---|
| `maxHeader` | `100` | Longest allowed first line. |

## Commands
| Command | Effect |
|---|---|
| `/commit-lint status` | Show whether the check is on. |
| `/commit-lint off` | Stop checking for this session; status line shows `commit-lint: OFF`. |
| `/commit-lint on` | Turn it back on. |

## Works with no-coauthor
`no-coauthor` rewrites the same commands to drop Claude trailers. `commit-lint` only reads the subject (the first line), which `no-coauthor` never changes, so the order of the two does not matter.

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/commit-lint
```

## Limits
- Reads the command line word by word: messages built by variables, scripts, `bash -c`, aliases or `git commit -F -` with a heredoc on stdin are not seen (and are allowed).
- Only the commit command is checked, not hooks or commits made by other tools.

## Develop
```sh
claude plugin validate mods/commit-lint
claude plugin test mods/commit-lint   # 19 tests
```
