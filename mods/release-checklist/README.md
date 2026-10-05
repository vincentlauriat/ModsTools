# release-checklist

Runs pre-release checks for a macOS app project in a pane, and reminds you to verify the build after a release script runs.

## What it does
- `/release-checklist [version]` gathers data from the session folder and opens a pane with one line per check (`✓` ok, `✗` fail, `–` skipped) and a summary (`1 of 7 checks failed`):
  - `project.yml`: has a `MARKETING_VERSION`, and one matching the given version if any.
  - `release.sh`: `Scripts/release.sh` default `NOTARY_PROFILE="${NOTARY_PROFILE:-...}"` matches the expected profile (option `notaryProfile`; code only, comments ignored).
  - `release/ output`: `RELEASE_DIR` in the script points into a `release` folder.
  - `.gitignore`: ignores `*.dmg`.
  - `Developer ID`: `security find-identity -v -p codesigning` lists a `Developer ID Application` identity.
  - `git`: working tree clean and not on `main`.
  - `CHANGES.md`: mentions the version (skipped when no version is given).
- After a successful Bash command running `release.sh`, shows a 15 s toast: verify with `spctl -a -t exec -vv <App>.app`, `xcrun stapler validate <dmg>`, `codesign --verify --deep --strict <App>.app`.

## Commands
| Command | Effect |
|---|---|
| `/release-checklist [version]` | Run the checks and open the pane |
| `/release-checklist close` | Close the pane |

## Options
| Option | Type | Default | Meaning |
|---|---|---|---|
| `notaryProfile` | string | `AppliMacVincentGithub` | Expected default of `NOTARY_PROFILE` in `Scripts/release.sh` — set it to your own `notarytool` keychain profile |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/release-checklist
```

## Limits
- Specific to one workflow: XcodeGen `project.yml` + `Scripts/release.sh` with a `NOTARY_PROFILE` default and a `RELEASE_DIR`.
- The version check passes if any `MARKETING_VERSION` in `project.yml` matches.
- Checks are a snapshot; rerun the command to refresh. The checklist never builds, signs or notarizes anything.

## Develop

```sh
claude plugin validate mods/release-checklist
claude plugin test mods/release-checklist   # 14 tests
```
