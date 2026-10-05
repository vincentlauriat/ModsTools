# env-protect

Asks for confirmation before Claude reads a secret file, judged by file name.

## What it does
- Checks `Read`, `Grep`, `Glob` and `Bash` calls; a match turns the verdict into an **ask** (permission prompt) with the reason. A call already denied stays denied.
- Secret names: `.env` and `.env.*` (except `.example`, `.sample`, `.template`), `*.pem`, `*.key`, `*.p12`, keychains (`*.keychain*`), SSH private keys (`id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa`, not `.pub`), `.netrc`, `.npmrc`, `.pypirc`, `.aws/credentials`.
- `Read` checks `file_path`; `Grep`/`Glob` check `path` and the glob when it names a secret file directly (`**/.env`, `*.pem`), not a broad one (`**/*`).
- `Bash`: readers such as `cat`, `head`, `tail`, `less`, `source`, `.`, `grep`, `rg`, `awk`, `sed`, `cp`, `scp`, `rsync`, `openssl`, `base64`, `xargs`, `open`, including `< file` and `--flag=file`; wrappers like `sudo`, `env`, `rtk` are looked through. Also `security find-generic-password|find-internet-password` with `-w` or `-g`.

## Commands
| Command | Effect |
|---|---|
| `/env-protect status` | Show whether checks are on (default when no argument) |
| `/env-protect off` | Disable for this session (status line shows `env-protect: OFF`) |
| `/env-protect on` | Re-enable |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/env-protect
```

## Limits
- Matches file names only: `grep -r KEY .`, paths built from variables or `$(...)`, scripts that read the file themselves, symlinks and renamed copies are not seen.
- Word-level parsing: a seatbelt against accidental reads, not a security boundary.
- Asks through the permission system: in `auto` / `bypassPermissions` mode the mode settles the question.

## Develop

```sh
claude plugin validate mods/env-protect
claude plugin test mods/env-protect   # 76 tests
```
