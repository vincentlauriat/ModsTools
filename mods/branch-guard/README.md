# branch-guard

Asks for your confirmation before Claude edits a file in a git repo while it is on `main` or `master`.

## What it does
- Checks each `Edit`, `Write` and `NotebookEdit` call through the permission system (`tool.check`) and turns it into an "ask" prompt when the file's repo is on a protected branch. A call already denied stays denied; this mod never denies.
- Reads the branch with `git -C <file's folder> rev-parse --abbrev-ref HEAD` (repo root from `git rev-parse --show-toplevel`), cached for 30 seconds per repo. For a new file in a new folder it uses the closest existing parent folder.
- Never asks for files outside any repo, or ignored by git (`git check-ignore`).
- Asks once per repo and session: when an asked edit actually ran (you allowed it), the repo is remembered as allowed. A refused edit keeps asking.

## Options
| Option | Default | Effect |
|---|---|---|
| `protectedBranches` | `main,master` | Comma-separated branch names that trigger the question. |

## Commands
| Command | Effect |
|---|---|
| `/branch-guard status` | Show whether the guard is on and the protected branches. |
| `/branch-guard off` | Stop asking for this session; status line shows `branch-guard: OFF`. |
| `/branch-guard on` | Turn it back on. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/branch-guard
```

## Limits
- A branch switch is seen after the 30-second cache expires.
- The prompt goes through the permission system: in `auto`/`bypassPermissions` mode the mode settles the question.
- Edits made through `Bash` (`sed -i`, redirections) are not covered; see `path-fence` and `main-guard` for related checks.
- A repo with no commit yet (no `HEAD`) is not asked.

## Develop
```sh
claude plugin validate mods/branch-guard
claude plugin test mods/branch-guard   # 13 tests
```
