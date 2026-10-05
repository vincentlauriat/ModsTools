# simulator-pane

A pane listing the booted Apple simulators (iOS, watchOS, tvOS, visionOS) with two-step buttons that shut them down, and an optional status line counting them.

## What it does
- `/simulators` opens a "Simulators" pane (never opens by itself). It reads `xcrun simctl list devices booted -j` and shows each booted device as `name · runtime · short UDID` (for example `iPhone 17 · iOS 27.0 · 1A2B3C4D`). The runtime name comes from the runtime identifier (`…SimRuntime.iOS-27-0` → `iOS 27.0`, `xrOS` → `visionOS`).
- Each row has a **Shut down** button, and the pane a **Shut down all** button. The first press turns the button into **Confirm?**; the second runs `xcrun simctl shutdown <udid>` (or `xcrun simctl shutdown all`), refreshes the pane and shows a toast with the result. Any other press or a refresh resets the confirmation.
- A **Refresh** button reloads the list.
- Status line `📱 N booted` while at least one simulator is booted, refreshed at session start and after each main-agent turn (one `simctl` call, 10 s timeout; subagent turns are skipped). Turn it off with the `statusLine` option.
- Without Xcode (or outside macOS) the pane says `simctl unavailable` and the status line stays empty.

## Commands
| Command | Effect |
|---|---|
| `/simulators` | Reload and open the pane |
| `/simulators refresh` | Reload and reset any pending confirmation |
| `/simulators close` | Close the pane |

## Options
| Option | Default | Effect |
|---|---|---|
| `statusLine` | `true` | Show `📱 N booted` in the status line; `false` also skips the per-turn `simctl` call |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/simulator-pane
```

## Limits
- The list is a snapshot: a simulator booted or shut down elsewhere shows up at the next refresh, turn end or button press.
- A failed shutdown shows `simctl`'s first error line as is; success is judged by the exit code only.
- `Shut down all` stops every booted simulator, including those another tool started.
- macOS with Xcode (`xcrun simctl`) only.

## Develop

```sh
claude plugin validate mods/simulator-pane
claude plugin test mods/simulator-pane   # 14 tests
```
