# ModsTools

A collection of Claude Code mods (plugins of function hooks).

## Mods

| Mod | What it does |
|---|---|
| [`changed-files`](mods/changed-files) | Pane listing the files Claude modified during the session — through Edit/Write/NotebookEdit, and through Bash commands in a git repository (detected by diffing the repo's dirty files before and after each command) — with a change count per file. `/changed-files` opens it. |

| [`main-guard`](mods/main-guard) | Refuses `git push` to `main`/`master`, force pushes, pushing tags, `git tag` creation/deletion and `gh release create/edit/delete` until the user allows it. `/main-guard off\|on\|status`. |
| [`doc-sync-guard`](mods/doc-sync-guard) | In projects with `COMMANDS.md`/`CHANGES.md`: a band above the prompt when a turn did not update `COMMANDS.md`, or changed code (edit tools, or Bash via git + mtimes) without updating `CHANGES.md`. |
| [`xcode-build-watch`](mods/xcode-build-watch) | After a turn edits `.swift` files, builds the enclosing Xcode project (Debug, unsigned, scheme named after the project) or Swift package in the background; result in the status line, toast on failure, `/build-status` for the errors. |

## Use

```sh
claude --plugin-dir ~/DevApps/ModsTools/mods/changed-files \
       --plugin-dir ~/DevApps/ModsTools/mods/main-guard \
       --plugin-dir ~/DevApps/ModsTools/mods/doc-sync-guard \
       --plugin-dir ~/DevApps/ModsTools/mods/xcode-build-watch
```

## Develop

```sh
claude plugin validate mods/<mod>
claude plugin test mods/<mod>
```
