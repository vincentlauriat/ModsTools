# sparkle-guard

Protects the Sparkle EdDSA signing key. Losing or regenerating it breaks auto-update for every installed copy of the app: they only accept updates signed with the key matching their `SUPublicEDKey`.

## What it does
`tool.check` rules, applied to the main conversation and subagents alike. An engine `deny` is never weakened.

| Tool | Situation | Verdict |
|---|---|---|
| `Bash` | `security delete-generic-password` / `delete-internet-password` aimed at the Sparkle item: service `https://sparkle-project.org`, label `Private key for signing Sparkle updates`, or `-a ed25519` (the default account) | **deny** |
| `Bash` | `generate_keys` without `-p`/`--lookUpPublicKey` or `-x`/`--exportedPrivateKeyFile` (it creates a new key when it finds none, e.g. in another keychain or `--account`) | **ask** |
| `Bash` | `generate_keys -f`/`--importedPrivateKeyFile` (imports a key in place of the current one), even beside `-p` | **ask** |
| `Edit`, `Write` | the change modifies or removes an existing `SUPublicEDKey` value | **ask** |

- The binary is matched by basename (`generate_keys`, `./bin/generate_keys`, `…/Sparkle/bin/generate_keys`); `rtk`, `sudo`, `env`, `xcrun`, `VAR=value` prefixes are stripped and `&&`, `||`, `;`, `|` chains are split.
- Edits are judged on the whole file: the current text is read, the edit applied (first occurrence, or all with `replace_all`), and the `SUPublicEDKey` values before and after compared. So an `Edit` whose `old_string` is only `<string>…</string>` is still caught. Adding a key where there was none, or a `Write` creating a new file, passes.
- Values are found in plists (`<key>SUPublicEDKey</key><string>…</string>`), YAML (`SUPublicEDKey: …`), build settings / xcconfig (`INFOPLIST_KEY_SUPublicEDKey = …`) and JSON.
- Every reason is one sentence saying why.

## Commands
| Command | Effect |
|---|---|
| `/sparkle-guard status` | Lists the rules |

## Sparkle `generate_keys` flags (research notes)
From the `generate_keys` source in the Sparkle 2.x repository (`generate_keys/main.swift`, read through a summarising fetch, not by running `--help`):
- no flag: looks the key up in the login keychain and prints the public key; **if none is found it generates a new key pair** and stores it;
- `-p` / `--lookUpPublicKey`: only prints the existing public key;
- `-x` / `--exportedPrivateKeyFile <file>`: exports the private key to a file;
- `-f` / `--importedPrivateKeyFile <file>`: imports a private key into the keychain instead of generating one;
- `--account <name>`: keychain account to use (default `ed25519`);
- keychain item: service `https://sparkle-project.org`, label `Private key for signing Sparkle updates`.

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/sparkle-guard
```

## Limits
- Removing an existing `SUPublicEDKey` asks too (treated like a change).
- Edits made through `Bash` (`sed -i`, `plutil -replace`, `PlistBuddy`) are not checked.
- `security delete-*` with only `-a <other account>` and no service or label is not recognised as the Sparkle item; a custom `--account` key deleted that way slips through.
- Commands hidden in `sh -c "…"`, `eval` or scripts are not parsed.
- An unreadable file (permissions) is not judged: the engine's verdict stands.

## Develop

```sh
claude plugin validate mods/sparkle-guard
claude plugin test mods/sparkle-guard   # 16 tests
```
