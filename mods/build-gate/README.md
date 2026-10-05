# build-gate

A band above the prompt when a turn changed source code and never ran a matching build or type-check.

## What it does
- Tracks each main-conversation turn (subagents are ignored). It does not read the answer text.
- **Code changed** = a successful `Edit`, `Write` or `NotebookEdit` on `.swift .ts .tsx .js .jsx .mjs .cjs .py .rs .go .kt .java .c .cc .cpp .m .mm .h`, mapped to Swift, TS/JS, Python, Rust, Go, Kotlin/Java or C/ObjC.
- **Matching check** = a `Bash` command with a segment (split on `&&`, `;`, `||`, newlines), after the edit, that builds or checks that language: Swift `xcodebuild`, `swift build|test`; TS/JS `tsc`, `npm|pnpm|yarn [run] build|test|lint|typecheck`, `vitest`, `jest`, `claude plugin test|validate`; Python `pytest`, `python -m pytest`, `mypy`, `ruff`; Rust `cargo build|test|check|clippy|run`; Go `go build|test|vet`; C/ObjC `xcodebuild`, `make`, `clang`; Kotlin/Java `gradle`, `./gradlew`, `mvn`. `rtk` (and its `err|test` wrapper), `sudo`, `npx` and `VAR=value` prefixes are stripped. A check that fails still counts.
- When a turn ends with unchecked languages, the band shows `⚙ build-gate: Swift, Python changed, no build run this turn` with a **Dismiss** button.
- The band clears, language by language, on the next turn that runs a matching check, or on Dismiss.

## Commands
| Command | Effect |
|---|---|
| `/build-gate off` | Stop checking (and clear the band). |
| `/build-gate on` | Resume. |
| `/build-gate status` | Show the last turn: languages changed and still unchecked. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/build-gate
```

## Limits
- It cannot tell whether the check covered the edited files, nor whether it passed.
- Edits made through `Bash` (`sed -i`, redirects) are not seen.
- A check run before the edit in the same turn does not count.
- Kotlin/Java checks and `cargo run` go beyond the original list; adjust `hooks/gate.ts` if unwanted.
- The on/off switch lasts for the session only.

## Develop
```sh
claude plugin validate mods/build-gate
claude plugin test mods/build-gate   # 16 tests
```
