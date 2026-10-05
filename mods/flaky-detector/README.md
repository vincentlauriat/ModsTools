# flaky-detector

Spots test commands that failed and then passed with no code edit in between, toasts once per command and lists them in a pane.

## What it does
- Tracks Bash test commands (`npm|pnpm|yarn test`, `vitest`, `jest`, `pytest`, `cargo test`, `go test`, `swift test`, `xcodebuild … test`, `claude plugin test`) and whether each run passed or failed. Commands are normalised first: `rtk ` proxies and leading `VAR=value` prefixes are stripped, spaces collapsed, so `rtk vitest run` and `CI=1 vitest  run` are the same command.
- Counts every successful `Edit`, `Write` and `NotebookEdit` call (main conversation and subagents) as a code change.
- A command is **flaky** when it passes after a failure and no code change happened since that failure. A failure followed by an edit and then a pass is a normal fix, not flakiness.
- First detection per command shows the toast ``flaky-detector: `<cmd>` failed then passed with no code change``.
- The "Flaky tests" pane lists flaky commands, most recent first: `<command> · <fails> fail / <passes> pass · <hh:mm>`. It never opens by itself.

## Commands
| Command | Effect |
|---|---|
| `/flaky` | Open the pane. |
| `/flaky close` | Close it (`off` also works). |
| `/flaky clear` | Forget all history. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/flaky-detector
```

## Limits
- History is per session; at most 50 distinct commands are kept (oldest dropped).
- Edits made outside Claude (your editor, a formatter run from a script) are invisible, so a test that only passes after such a change is reported as flaky.
- Only Bash commands whose text matches the test list are tracked; a wrapper script hiding the test runner is not.
- Pass or fail comes from the tool result's error flag, not from parsing test output.

## Develop
```sh
claude plugin validate mods/flaky-detector
claude plugin test mods/flaky-detector   # 14 tests
```
