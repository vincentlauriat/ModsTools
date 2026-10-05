# ModsTools

A collection of 32 **Claude Code mods**: small plugins of function hooks that add panes, bands above the prompt, status-line entries, toasts, slash commands and tool-call guards to Claude Code (terminal and desktop Code tab).

Each mod lives in its own folder under [`mods/`](mods) with its own README, tests and manifest, and can be loaded on its own.

## Mods

### Guards — refuse or ask before risky actions
| Mod | What it does |
|---|---|
| [`main-guard`](mods/main-guard) | Refuses pushes to `main`/`master`, force pushes, tag pushes and creation, `gh release` writes. `/main-guard off\|on\|status` |
| [`rm-guard`](mods/rm-guard) | Asks before destructive Bash: `rm -rf`, `git reset --hard`, `git clean -f`, `find -delete`, `dd of=/dev/…`, SQL `DROP`/`TRUNCATE`… |
| [`secret-shield`](mods/secret-shield) | Refuses writing secret-looking values (API keys, tokens, private keys) through Edit/Write/Bash |
| [`env-protect`](mods/env-protect) | Asks before reading secret files (`.env*`, keys, `.netrc`, `.aws/credentials`…) |
| [`path-fence`](mods/path-fence) | Asks before writes outside the session folder (configurable allowed roots) |
| [`no-coauthor`](mods/no-coauthor) | Strips `Co-Authored-By: Claude…` trailers from `git commit` commands |
| [`doc-sync-guard`](mods/doc-sync-guard) | Band + toast when a turn did not update `COMMANDS.md`, or changed code without `CHANGES.md` |

### Session insight — see what is happening
| Mod | What it does |
|---|---|
| [`changed-files`](mods/changed-files) | Pane of files changed this session (edit tools and Bash in git repos) |
| [`diff-preview`](mods/diff-preview) | Pane with `git diff --stat` and the untracked-file count |
| [`command-history`](mods/command-history) | Pane of Bash commands with exit status and duration |
| [`tool-heatmap`](mods/tool-heatmap) | Pane counting calls and failures per tool |
| [`agent-tracker`](mods/agent-tracker) | Pane of subagents: running / done / failed, duration |
| [`network-log`](mods/network-log) | Pane of network activity: WebFetch, WebSearch, MCP, network Bash commands |
| [`turn-timer`](mods/turn-timer) | Band with the last turn's duration and tool count |
| [`context-gauge`](mods/context-gauge) | Band once the context window is ≥ 70 % full |
| [`cost-meter`](mods/cost-meter) | Status line with session cost and rate-limit usage, threshold toast |
| [`rtk-gain`](mods/rtk-gain) | Status line with RTK token savings |

### Productivity
| Mod | What it does |
|---|---|
| [`todo-pane`](mods/todo-pane) | Pane of `TODOS.md` checkboxes, toggled by click |
| [`prompt-snippets`](mods/prompt-snippets) | Reusable prompt fragments: `/snip add`, `;;name` expanded in prompts |
| [`auto-context`](mods/auto-context) | Adds git state and open TODOs to the system prompt |
| [`session-journal`](mods/session-journal) | Cross-session journal of turns: `/journal [yesterday\|week]` |
| [`je-coupe`](mods/je-coupe) | End-of-session ritual: "je coupe" asks to bring every project doc up to date |
| [`focus-mode`](mods/focus-mode) | Pomodoro countdown band: `/focus [minutes]` |
| [`done-sound`](mods/done-sound) | Chime when a long turn completes |
| [`french-guard`](mods/french-guard) | Toast when an answer looks English or lacks French accents |

### macOS & Xcode
| Mod | What it does |
|---|---|
| [`xcode-build-watch`](mods/xcode-build-watch) | Background Xcode / SwiftPM build after Swift edits, result in the status line |
| [`deriveddata-janitor`](mods/deriveddata-janitor) | Finds orphan DerivedData folders (removed worktrees); `/deriveddata-janitor clean` |
| [`release-checklist`](mods/release-checklist) | `/release-checklist [version]`: pre-release checks for a signed & notarized DMG |

### Fun
| Mod | What it does |
|---|---|
| [`streak`](mods/streak) | `🔥 N-day streak` in the status line |
| [`achievement`](mods/achievement) | 11 badges unlocked by real events, `/achievements` |
| [`mood-band`](mods/mood-band) | Optional mascot band whose mood follows the last turn |
| [`ascii-weather`](mods/ascii-weather) | Weather from wttr.in in the status line |

## Install

Requires a Claude Code build with function-hook plugins (developed against **2.1.289**). Several mods are macOS-specific (`xcode-build-watch`, `deriveddata-janitor`, `release-checklist`).

```sh
git clone https://github.com/vincentlauriat/ModsTools.git
claude --plugin-dir ModsTools/mods/main-guard --plugin-dir ModsTools/mods/changed-files   # one flag per mod
```

To load mods in every session (including the desktop app), list their absolute paths in `CLAUDE_CODE_PLUGIN_DIRS`, separated by `:`, in your environment or in the `env` block of `~/.claude/settings.json`. Mod options (`userConfig`) appear in the config menu and are stored under `pluginConfigs` in settings.

## Known limits

The guards parse command lines word by word: they do not see through `bash -c "…"`, `$(…)`, `eval`, aliases or scripts. They are seatbelts against accidents, not security boundaries. Mods that **ask** go through the permission system, so in `auto` / `bypassPermissions` mode the mode settles the question. Each mod's README lists its own limits.

## Develop

See [DEVELOPING.md](DEVELOPING.md).
