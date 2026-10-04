# ModsTools

A collection of Claude Code mods (plugins of function hooks).

## Mods

| Mod | What it does |
|---|---|
| [`changed-files`](mods/changed-files) | Pane listing the files Claude modified during the session — through Edit/Write/NotebookEdit, and through Bash commands in a git repository (detected by diffing the repo's dirty files before and after each command) — with a change count per file. `/changed-files` opens it. |

## Use

```sh
claude --plugin-dir ~/DevApps/ModsTools/mods/changed-files
```

## Develop

```sh
claude plugin validate mods/changed-files
claude plugin test mods/changed-files
```
