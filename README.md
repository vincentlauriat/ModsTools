# ModsTools

A collection of Claude Code mods (plugins of function hooks).

## Mods

| Mod | What it does |
|---|---|
| [`changed-files`](mods/changed-files) | Pane listing the files Claude modified during the session (Edit/Write/NotebookEdit), with an edit count per file. `/changed-files` opens it. |

## Use

```sh
claude --plugin-dir ~/DevApps/ModsTools/mods/changed-files
```

## Develop

```sh
claude plugin validate mods/changed-files
claude plugin test mods/changed-files
```
