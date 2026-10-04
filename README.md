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
| [`env-protect`](mods/env-protect) | Asks before Claude reads secret files (`.env*` except `.example/.sample/.template`, `*.pem`, `*.key`, `*.p12`, SSH private keys, `.netrc`, `.npmrc`, `.pypirc`, `.aws/credentials`, keychains) via Read, Grep/Glob or Bash readers (`cat`, `source`, `< file`, `security … -w`…). `/env-protect off\|on\|status`. |
| [`path-fence`](mods/path-fence) | Asks before Edit/Write/NotebookEdit or Bash writes (`>`, `tee`, `rm`, `mv`, `cp`, `mkdir`…) outside the session folder; `~/.claude`, `/tmp`, `/private/tmp`, `/var/folders` always allowed, extra roots via the `allowedRoots` option (comma-separated). `/path-fence off\|on\|status`. |
| [`deriveddata-janitor`](mods/deriveddata-janitor) | Finds Xcode DerivedData folders whose `WorkspacePath` is gone (removed worktrees…): status line `DerivedData: N orphans · X GB`, toast after `git worktree remove`; `/deriveddata-janitor` lists them, `/deriveddata-janitor clean` deletes them (only on that explicit command). |
| [`network-log`](mods/network-log) | Pane of the session's network activity (main agent and subagents ↳): WebFetch URLs, WebSearch queries, MCP calls, and Bash `curl`/`wget`/`gh`/`git push\|pull\|fetch\|clone`/`npm`/`pip`/`brew`/`ssh`/`scp`/`rsync`/`notarytool`, with host and ✓/✗/denied. `/network-log [close\|clear]`. |
| [`release-checklist`](mods/release-checklist) | `/release-checklist [version]`: pane checking `MARKETING_VERSION`, `release.sh` notary profile default (`AppliMacVincentGithub`, code not comments), output in `release/`, `*.dmg` gitignored, Developer ID identity, clean tree off `main`, CHANGES.md mentions the version. Toast after a successful `release.sh` reminding `spctl` / `stapler validate` / `codesign --verify`. |
| [`prompt-snippets`](mods/prompt-snippets) | Reusable prompt fragments kept across sessions: `/snip add\|rm\|list\|show`; `;;name` in a prompt is expanded, unknown names reported in a toast. |
| [`je-coupe`](mods/je-coupe) | Typing "je coupe" appends an instruction to update every doc file of the project (COMMANDS, CHANGES, MEMORY, TODOS, PLAN, README, ARCHITECTURE…), flagging those not modified this session; a band lists them until they are updated. |
| [`auto-context`](mods/auto-context) | Adds a session section to the system prompt: git branch (ahead/behind), dirty-file count, last commit, first 5 open items of TODOS.md `## Next`. Cached, refreshed each turn. `/auto-context [off\|on]`. |
| [`session-journal`](mods/session-journal) | Cross-session journal of turns (project, prompt first line, tool count, files edited), 30 days kept. `/journal [yesterday\|week\|clear]`. |
| [`focus-mode`](mods/focus-mode) | Pomodoro: `/focus [minutes]` (default 25) shows a countdown band, toast + Dismiss at the end; `/focus stop`. |
| [`done-sound`](mods/done-sound) | Plays a short original chime when a main turn took ≥ 30 s (`minSeconds` option). `/done-sound off\|on\|test`. |
| [`french-guard`](mods/french-guard) | After each answer, toasts when it looks English or contains ≥ 3 French words missing their accents (code, paths and URLs ignored). `/french-guard off\|on\|status`. |

### Known limits
- `main-guard` reads the command line word by word: it does not see through `bash -c "…"`, `$(…)`, `eval`, aliases or scripts, nor quoted text holding `;` or `|`. It is a seatbelt against accidental pushes, not a security boundary. The same goes for `rm-guard` and `secret-shield`.
- `rm-guard` asks through the permission system: in `auto`/`bypassPermissions` mode the mode settles the question.
- `command-history` reads the exit code from Bash's error text (`Exit code N`); `agent-tracker` keeps ⏳ for a subagent stopped without finishing its turn; `context-gauge` and `diff-preview` refresh at the end of a turn, not after `/compact` or a manual edit.
- `env-protect` matches file names only: `grep -r KEY .`, paths built from variables, scripts and symlinks are not seen. `path-fence` does not cover `sed -i`, `dd of=`, `curl -o`, `tar -C`, git writes or scripts, nor symlinks; the fence is the session folder, not the git root. Both ask through the permission system (see `rm-guard`). `deriveddata-janitor` never judges `/Volumes/…` workspaces (disk may be unmounted).
- `network-log` classifies a Bash line by its first network segment; MCP "hosts" are server names. `release-checklist` passes a version if any `MARKETING_VERSION` in `project.yml` matches.
- `session-journal` and `prompt-snippets` use `$.store` with read-modify-write (two sessions at once may lose an entry); turns started by a slash command may log `(no prompt)`. `french-guard` is a heuristic (stopword ratio, ~50 unaccented words). `focus-mode`/`done-sound`: a hot reload in the middle of a countdown/turn delays the end toast or skips the sound.
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
