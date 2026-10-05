# path-fence

Asks for confirmation before Claude writes outside the session folder.

## What it does
- Checks `Edit`, `Write`, `NotebookEdit` (`file_path` / `notebook_path`) and simple `Bash` writes; a path outside the fence turns the verdict into an **ask** naming the path. A call already denied stays denied.
- Bash coverage: `>`, `>>`, `&>` redirections, `tee`, `mv`, `cp`, `rm`, `rmdir`, `touch`, `mkdir`, `install`, `ln`. `/dev/...` targets and paths containing `$` or backticks (other than a leading `$HOME`) are ignored.
- Always allowed: the session folder, `~/.claude`, `/tmp`, `/private/tmp`, `/var/folders`, `/private/var/folders`, plus the `allowedRoots` option. `~`, `.` and `..` are resolved; a path that cannot be anchored counts as outside.

## Commands
| Command | Effect |
|---|---|
| `/path-fence status` | Show whether it is on and the current fence (default when no argument) |
| `/path-fence off` | Disable for this session (status line shows `path-fence: OFF`) |
| `/path-fence on` | Re-enable |

## Options
| Field | Type | Default | Meaning |
|---|---|---|---|
| `allowedRoots` | string | `""` | Comma-separated absolute folders (or `~/...`) where writes never ask |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/path-fence
```

## Limits
- Not covered: `sed -i`, `dd of=`, `curl -o`, `tar -C`, git writes, scripts or editors that write by themselves, command substitutions, variables other than `$HOME`, symlinks (paths are compared as written).
- The fence is the session folder, not the git root.
- Asks through the permission system: in `auto` / `bypassPermissions` mode the mode settles the question.

## Develop

```sh
claude plugin validate mods/path-fence
claude plugin test mods/path-fence   # 72 tests
```
