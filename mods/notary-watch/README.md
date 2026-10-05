# notary-watch

Follows the Apple notarization submissions Claude makes with `xcrun notarytool submit`, so a long notarization does not have to be checked by hand.

## What it does
- Watches the main agent's Bash calls that run `xcrun notarytool submit …`, also behind `rtk`, `env`, `VAR=value`, `cd dir &&` or a pipe. Subagent calls are ignored. A failed call counts only when its output still shows a status (a `--wait` cut short or ended on Invalid): the upload went through.
- Reads the submission id from the output: the `id` key when the command used `--output-format json` (or `-f json`), otherwise the UUID after the `id:` field label. Other UUIDs (an issuer, a path) are never taken for the id.
- With `--wait`: takes the final status from the output and shows a toast, with no polling:
  - `notary ✓ accepted — now staple (1a2b3c4d)`
  - `notary ✗ invalid (1a2b3c4d) — see why: xcrun notarytool log <id> <auth>` (same for `rejected`)
- Without `--wait`, or when `--timeout` ended the wait while still in progress:
  - status line `notary: 1a2b3c4d In Progress` (`notary: N in progress` for several)
  - every 60 s runs `xcrun notarytool info <id> <auth> --output-format json` (30 s timeout) with the same auth options as the submit: `--keychain-profile`/`-p` (plus `--keychain`), `--apple-id` + `--team-id` + `--password`, or `--key`/`-k` + `--key-id`/`-d` (+ `--issuer`/`-i`)
  - on Accepted, Invalid or Rejected: the toast above, then polling stops and the line clears
  - a failed or unreadable poll is retried at the next minute; after 2 hours it gives up with a toast
- The auth options are kept in the module's memory only, for as long as polling lasts: never in `$.store`, a toast, the status line or `/notary-watch`. The log hint prints `<auth>` as a placeholder.
- When the auth comes from the shell (`--keychain-profile "$NOTARY_PROFILE"`, a backquote) or would prompt (`--apple-id` without `--password`), the submission is listed but not polled, and a toast says so.

## Commands
| Command | Effect |
|---|---|
| `/notary-watch` | Lists the submissions seen this session: id, file, status, age, polling state |
| `/notary-watch stop` | Stops all polling and clears the status line |

## Example

```sh
xcrun notarytool submit release/App.zip --keychain-profile MyNotaryProfile --output-format json
# status line: notary: 1a2b3c4d In Progress
# a few minutes later, toast: notary ✓ accepted — now staple (1a2b3c4d)
```

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/notary-watch
```

## Limits
- Only a `notarytool submit` written in the Bash command itself is seen: one run inside a script (`Scripts/release.sh`) is not, nor a submit run in the background (no output yet).
- `--output-format plist` output is not parsed (JSON and the normal format are).
- Tracking lives in memory: a session restart or a reload of the mod forgets it.
- Polling runs in the session folder, so a relative `--key` path given after a `cd` may not resolve.
- Status values are notarytool's own (`Accepted`, `In Progress`, `Invalid`, `Rejected`); English sentences in its output are never matched.

## Develop

```sh
claude plugin validate mods/notary-watch
claude plugin test mods/notary-watch   # 18 tests
```
