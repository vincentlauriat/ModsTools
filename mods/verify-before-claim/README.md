# verify-before-claim

"Verify, then speak": warns when a turn changed code, claimed success, and never ran a build, test or lint.

## What it does
- Tracks each main-conversation turn (subagents are ignored): whether code was changed, and whether a check command ran.
- **Code changed** = a successful `Edit`, `Write` or `NotebookEdit` on a file that is not `.md` or `.txt`. Code changed through `Bash` is not seen.
- **Check ran** = a `Bash` command with a segment (split on `&&`, `;`, `||`) that is `xcodebuild`, `swift build|test`, `npm|pnpm|yarn [run] build|test|lint`, `tsc`, `vitest`, `jest`, `pytest`, `cargo build|test|check|clippy`, `go build|test|vet`, `make`, `gradle`, `claude plugin test|validate`, `swiftlint`, `eslint`, or an `rtk err|test` wrapper. `rtk`, `sudo`, `npx` and `VAR=value` prefixes are stripped. A check that fails still counts: it was run.
- When a turn completes with code changed, no check run, and a success claim in the answer, a toast `verify-before-claim: success claimed without running a build or test this turn` appears and a band above the prompt shows the same message with a **Dismiss** button.
- The band clears on the next turn that runs a check, or on Dismiss.

## Commands
| Command | Effect |
|---|---|
| `/verify-before-claim off` | Stop checking (and clear the band). |
| `/verify-before-claim on` | Resume. |
| `/verify-before-claim status` | Show the last turn: code changed, checks run, claim found. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/verify-before-claim
```

## Limits
- Claim detection is a phrase heuristic on prose only (fenced and inline code are ignored), in French and English: "corrigé", "ça marche", "les tests passent", "build réussi", "tout passe", "terminé", "c'est bon", "fixed", "works now", "all tests pass", "build succeeds", "done", and a few variants.
- A sentence containing a negation (`pas`, `n'`, `not`, `n't`, `never`, `no`), a conditional (`si`, `if`, `once`, `unless`) or ending with `?` is never a claim. This avoids "not fixed yet" and "is it fixed?" but also misses real claims such as "there is no error left, fixed". Other phrasings ("should be good now") are not detected, and a bare "done" can be a false positive.
- It cannot tell whether the check covered the changed code, nor whether it passed.
- Edits made through `Bash` (`sed -i`, redirects) do not count as code changed.
- The on/off switch lasts for the session only.

## Develop
```sh
claude plugin validate mods/verify-before-claim
claude plugin test mods/verify-before-claim   # 17 tests
```
