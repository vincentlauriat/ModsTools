# notary-watch

Follows the Apple notarization submissions Claude makes with `xcrun notarytool submit`, typed directly or run from a release script (`./Scripts/release.sh 1.2.0`), so a long notarization does not have to be checked by hand.

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
- The auth options are kept in the module's memory only, for as long as polling lasts: never in `$.store`, a toast, the status line or `/notary-watch` (except a release script run's keychain profile name, not a secret, which `/notary-watch` shows). The log hint prints `<auth>` as a placeholder.
- When the auth comes from the shell (`--keychain-profile "$NOTARY_PROFILE"`, a backquote) or would prompt (`--apple-id` without `--password`), the submission is listed but not polled, and a toast says so.

### Release scripts
- A main-agent Bash command that runs a script whose file name contains `scriptPattern` (default `release`) counts as a release run: `./Scripts/release.sh 1.2.0`, `cd app && Scripts/release-full.sh`, `bash release.sh`, also behind `rtk`, `env` or `VAR=value`. Only the command position counts: `cd release`, `echo Scripts/release.sh`, `cat release.sh` or `gh release create` do not.
- The start time is noted before the command runs. Once its result is back (success or failure; the result is never delayed), the mod runs `xcrun notarytool history --keychain-profile <profile> --output-format json` (30 s timeout) and takes the submissions whose `createdDate` is at most 60 s before the start.
- Each new submission is followed exactly like a direct submit (status line, `notarytool info` every 60 s, toasts, 2 h limit), with `--keychain-profile <profile>` as its auth. One that history already shows Accepted, Invalid or Rejected is only toasted. An id already followed (a direct submit in the same command, an earlier scan) is never followed twice.
- A script run in the background (`run_in_background`, Ctrl+B, or moved there on timeout) returns at once: `history` is then asked every 60 s for 30 min.
- The keychain profile is the `keychainProfile` option, or, when empty, read from the script's text (comments ignored): the `--keychain-profile` values, resolved through `NOTARY_PROFILE="${NOTARY_PROFILE:-<name>}"`-style defaults (a `NOTARY_PROFILE=…` written before the script on the command line wins), else such a `*PROFILE*` default alone. When it cannot be told (a value from `$1`, several different profiles, an unreadable script), nothing is asked and `/notary-watch` says so. The profile name may appear in `/notary-watch`, never in a toast.

## Configuration
| Option | Default | Effect |
|---|---|---|
| `scriptPattern` | `release` | Text a release script's file name contains (case-insensitive); empty turns script support off |
| `keychainProfile` | *(empty)* | The notarytool keychain profile `history` is asked with; empty reads it from the script |

Set them in the config menu, or under `pluginConfigs` in settings:

```json
{ "pluginConfigs": { "notary-watch": { "options": { "keychainProfile": "MyNotaryProfile" } } } }
```

## Commands
| Command | Effect |
|---|---|
| `/notary-watch` | Lists the submissions seen this session (id, file, status, age, polling state), then each release script run (name, age, profile, new submissions found, state) |
| `/notary-watch stop` | Stops all polling, including background history watching, and clears the status line |

## Example

```sh
xcrun notarytool submit release/App.zip --keychain-profile MyNotaryProfile --output-format json
# status line: notary: 1a2b3c4d In Progress
# a few minutes later, toast: notary ✓ accepted — now staple (1a2b3c4d)

./Scripts/release.sh 1.2.0
# after it returns: notarytool history finds the submission it made, then as above
```

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/notary-watch
```

## Limits
- A script that submits is seen only through `notarytool history` with a keychain profile: a script that authenticates with an API key or an Apple ID and password is not followed unless `keychainProfile` names a profile for the same team. A direct submit run in the background (no output yet) is not seen.
- `history` lists the whole team's submissions: one made by a teammate or another machine in the same window is followed too.
- A script is recognised in command position only, by its file name; the profile is read from that file's text only (nothing it sources, no environment but the command line's own `VAR=value`). Its path is resolved from the session folder plus any `cd` in the same command, so a Bash shell left in another folder by an earlier `cd` may not find it.
- A foreground script run gets one `history` check; if it fails (timeout, network), `/notary-watch` says so and nothing is retried. Background runs are watched for 30 min only.
- The `history` JSON shape (`history[]` of `createdDate`, `id`, `name`, `status`) is taken from notarytool's `--help` and its own key names; it was not observed against an account.
- `--output-format plist` output is not parsed (JSON and the normal format are).
- Tracking lives in memory: a session restart or a reload of the mod forgets it.
- Polling runs in the session folder, so a relative `--key` path given after a `cd` may not resolve.
- Status values are notarytool's own (`Accepted`, `In Progress`, `Invalid`, `Rejected`); English sentences in its output are never matched.

## Develop

```sh
claude plugin validate mods/notary-watch
claude plugin test mods/notary-watch   # 29 tests
```
