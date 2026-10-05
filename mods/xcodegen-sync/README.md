# xcodegen-sync

A band above the prompt reminding to regenerate the Xcode project with XcodeGen when its file set changed, with a button that runs it.

## What it does
- Watches successful main-conversation tool calls (subagents are ignored):
  - an `Edit`, `Write` or `NotebookEdit` of a `project.yml`;
  - a `Write` that **creates** a `.swift` file (the file did not exist before the call);
  - a `Bash` command whose `rm`, `git rm`, `mv` or `git mv` names `.swift` files (globs such as `Sources/*.swift` included). `rtk`, `sudo`, `env`, `VAR=value` prefixes are stripped, `cd X &&` and `git -C X` are followed.
- Edits to existing `.swift` files do not count: XcodeGen only cares about the file set.
- For each touched path it looks for the closest folder at or above it holding a `project.yml`. No such folder, nothing happens.
- Each pending folder gets a row: `XcodeGen: project.yml or Swift files changed in <folder> — run xcodegen generate`, with:
  - **Run xcodegen**: runs `xcodegen generate` in that folder (60 s timeout) and toasts `xcodegen: generated <folder>` or the first line the tool wrote on failure; success clears the row;
  - **Dismiss**: clears the row.
- A successful `Bash` run of `xcodegen generate` (or bare `xcodegen`, optionally `rtk`- or `cd x &&`-prefixed, `--spec path/project.yml` honoured) clears the row of that folder by itself. Success is the tool's error flag (exit code), never its output text.

## Commands
| Command | Effect |
|---|---|
| `/xcodegen-sync` | Shows on/off and the folders waiting |
| `/xcodegen-sync off` | Stops tracking and clears the band (kept across sessions) |
| `/xcodegen-sync on` | Resumes tracking |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/xcodegen-sync
```

## Limits
- Relative paths in `Bash` are resolved against the session folder (plus any `cd` in the same command line), not a folder changed by an earlier command.
- Files created by `Bash` (`touch`, `cp`, redirects), `rm -r` of a whole folder and `mv` of a folder are not seen.
- The pending list is per session; a new session starts empty.
- `project.yml` is the only spec name looked for (no `--spec other.yml` lookup when tracking).

## Develop

```sh
claude plugin validate mods/xcodegen-sync
claude plugin test mods/xcodegen-sync   # 19 tests
```
