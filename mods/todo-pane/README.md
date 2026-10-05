# todo-pane

A pane showing the `TODOS.md` of the session folder as clickable checkboxes.

## What it does
- Reads `TODOS.md` in the session folder and lists its `## ` headings (bold) and checkbox items (`- [ ]`, `- [x]`, `* [ ]`, indented ones included) as `☐` / `☑` buttons.
- Pressing an item toggles its checkbox and writes the file back. The line is re-checked first: if it changed since the pane loaded, nothing is written.
- The pane opens at session start and reloads after a successful `Edit`/`Write` of a file ending in `TODOS.md` and after any Bash command mentioning `TODOS.md`.
- Shows "No TODOS.md in this folder." when the file is missing.

## Commands
| Command | Effect |
|---|---|
| `/todos` | Open the pane and reload the file. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/todo-pane
```

## Limits
- Only `##` headings are shown (not `#` or `###`); text that is not a heading or checkbox is hidden.
- The file name and location are fixed: `TODOS.md` in the session folder.
- Edits made outside Claude's tools are not seen until `/todos` or the next relevant tool call.

## Develop
```sh
claude plugin validate mods/todo-pane
claude plugin test mods/todo-pane   # 11 tests
```
