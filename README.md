# ModsTools

A collection of Claude Code mods (plugins of function hooks).

## Mods

| Mod | What it does |
|---|---|
| [`changed-files`](mods/changed-files) | Pane listing the files Claude modified during the session (`/changed-files [close|clear]`) — through Edit/Write/NotebookEdit, and through Bash commands in a git repository (detected by diffing the repo's dirty files before and after each command) — with a change count per file. `/changed-files` opens it. |
| [`main-guard`](mods/main-guard) | Refuses `git push` to `main`/`master`, force pushes, pushing tags, `git tag` creation/deletion and `gh release create/edit/delete` until the user allows it. `/main-guard off\|on\|status`. |
| [`doc-sync-guard`](mods/doc-sync-guard) | In projects with `COMMANDS.md`/`CHANGES.md`: a band above the prompt when a turn did not update `COMMANDS.md`, or changed code (edit tools, or Bash via git + mtimes) without updating `CHANGES.md`. |
| [`xcode-build-watch`](mods/xcode-build-watch) | After a turn edits `.swift` files, builds the enclosing Xcode project (Debug, unsigned, scheme named after the project) or Swift package in the background; result in the status line, toast on failure, `/build-status` for the errors. |
| [`no-coauthor`](mods/no-coauthor) | Strips `Co-Authored-By: Claude…/Anthropic` trailers from `git commit` commands (`-m`, heredoc, `--trailer`); human co-authors kept. |
| [`secret-shield`](mods/secret-shield) | Refuses Edit/Write/Bash containing secret-looking values (Anthropic/OpenAI keys, GitHub tokens, AWS key ids, Slack, Google API keys, PEM private keys), with a masked preview; placeholders ignored. `/secret-shield off\|on\|status`. |
| [`rm-guard`](mods/rm-guard) | Makes destructive Bash commands ask for confirmation (`rm -rf` outside `/tmp`, `git reset --hard`, `git clean -f`, `git checkout/restore .`, `find -delete`, `mkfs`, `dd of=/dev/`, SQL `DROP`/`TRUNCATE` via a DB client). `/rm-guard off\|on\|status`. |
| [`turn-timer`](mods/turn-timer) | Band above the prompt: `⏱ last turn 42s · 12 tools`, Hide button, toast past 2 minutes. |
| [`tool-heatmap`](mods/tool-heatmap) | Pane counting calls and failures per tool with bars. `/tool-heatmap`. |
| [`todo-pane`](mods/todo-pane) | Pane showing `TODOS.md` headings and checkboxes; click to toggle (written back to the file). `/todos`. |
| [`command-history`](mods/command-history) | Pane listing the main conversation's Bash commands: ✓ / ✗ exit code / denied / interrupted, duration, newest first (50 kept). `/command-history [close\|clear]`. |
| [`diff-preview`](mods/diff-preview) | Pane with `git diff --stat` and the untracked-file count of the session folder, refreshed after each turn. `/diff-preview [refresh\|close]`. |
| [`cost-meter`](mods/cost-meter) | Status line `$1.23 · 5h 42%` (session cost + most used rate-limit window); toast once past a threshold (`thresholdUsd` option, default $5). `/cost-meter` for the details. |
| [`context-gauge`](mods/context-gauge) | Band above the prompt once the context window is ≥ 70% full (`Context 78% ▓▓▓▓▓▓▓▓░░ — consider /compact`), red from 90%. |
| [`agent-tracker`](mods/agent-tracker) | Pane listing subagents (foreground and background): running ⏳ / done ✓ / failed ✗, duration. `/agent-tracker [close\|clear]`. |
| [`rtk-gain`](mods/rtk-gain) | Status line with RTK's global token savings (`rtk −19.3M tok (50%)`), refreshed at most every 5 minutes. `/rtk-gain` for the full report. |

### Known limits
- `main-guard` reads the command line word by word: it does not see through `bash -c "…"`, `$(…)`, `eval`, aliases or scripts, nor quoted text holding `;` or `|`. It is a seatbelt against accidental pushes, not a security boundary. The same goes for `rm-guard` and `secret-shield`.
- `rm-guard` asks through the permission system: in `auto`/`bypassPermissions` mode the mode settles the question.
- `command-history` reads the exit code from Bash's error text (`Exit code N`); `agent-tracker` keeps ⏳ for a subagent stopped without finishing its turn; `context-gauge` and `diff-preview` refresh at the end of a turn, not after `/compact` or a manual edit.
- `xcode-build-watch` only reacts to the main conversation's Edit/Write on `.swift` files inside the session folder (not Bash, not subagents/worktrees). A background build can overlap a manual `xcodebuild` on the same DerivedData.

## Use

```sh
claude --plugin-dir ~/DevApps/ModsTools/mods/changed-files \
       --plugin-dir ~/DevApps/ModsTools/mods/main-guard \
       --plugin-dir ~/DevApps/ModsTools/mods/doc-sync-guard \
       --plugin-dir ~/DevApps/ModsTools/mods/xcode-build-watch   # …one --plugin-dir per mod
```

## Develop

```sh
claude plugin validate mods/<mod>
claude plugin test mods/<mod>
```
