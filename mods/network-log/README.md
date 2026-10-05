# network-log

A pane listing the network activity of the session, to see what Claude reached out to.

## What it does
- Logs, newest first (100 kept), each entry as `<status> <kind> <target> · <host>` with status `✓`, `✗` or `denied`. Subagent calls are marked `↳`.
- Kinds: `web` (`WebFetch` URL), `search` (`WebSearch` query), `mcp` (any `mcp__server__tool` call; the "host" is the server name), `bash`.
- Bash lines are classified by their first network segment: `curl`, `wget`, `http`, `xh`, `ssh`, `scp`, `rsync` (remote only), `gh`, `git push|pull|fetch|clone`, `pip install`, `brew install|upgrade`, `xcrun notarytool`, and `npm`/`pnpm`/`yarn` `install|i|add|publish`.
- Pane header: `12 requests · 4 hosts`.

## Commands
| Command | Effect |
|---|---|
| `/network-log` | Open the pane |
| `/network-log close` | Close the pane |
| `/network-log clear` | Empty the log |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/network-log
```

## Limits
- One entry per Bash command, from its first network segment only; scripts and subshell contents are not seen.
- Records the call, not the traffic: it does not capture what a tool does on the network beyond what the command line shows.
- Kept in memory for the session.

## Develop

```sh
claude plugin validate mods/network-log
claude plugin test mods/network-log   # 9 tests
```
