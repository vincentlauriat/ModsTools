# xcode-build-watch

Builds your Xcode project or Swift package in the background after Claude edits Swift files, so a broken build shows up right away.

## What it does
- Watches successful `Edit`/`Write` calls on `.swift` files inside the session folder, made by the main conversation.
- When the turn ends, finds the nearest enclosing folder with an `.xcworkspace`, `.xcodeproj`, `Package.swift` or `project.yml`, and builds it once per turn:
  - Xcode: `xcodebuild -configuration Debug -quiet CODE_SIGNING_ALLOWED=NO build`, using the scheme named after the project, else the first scheme `xcodebuild -list` reports;
  - Swift package: `swift build`;
  - `project.yml` without an `.xcodeproj`: reports "run xcodegen generate first".
- Status line: `⏳ building <name>…`, then `✅ <name> builds (Ns)` or `❌ <name>: build failed, N errors`. A toast appears on failure.
- If a build is already running for the same project, one more build is queued afterwards.

## Commands
| Command | Effect |
|---|---|
| `/build-status` | Print the last result and up to 20 distinct `error:` lines. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/xcode-build-watch
```

## Limits
- Only reacts to the main conversation's Edit/Write, not Bash, subagents or worktrees.
- A background build can overlap a manual `xcodebuild` on the same DerivedData.
- Build cut off after 10 minutes; scheme listing after 2 minutes.
- Errors are matched on the text `error:` in the output.

## Develop
```sh
claude plugin validate mods/xcode-build-watch
claude plugin test mods/xcode-build-watch   # 8 tests
```
