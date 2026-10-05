# secret-shield

Refuses file writes and commands that contain secret-looking values, so credentials never land in your code or shell history.

## What it does
- Scans the content of `Write`, the `new_string` of `Edit`, and the command of `Bash` before they run.
- Detects: Anthropic keys (`sk-ant-...`), OpenAI keys (`sk-...`), GitHub tokens (`ghp_`/`gho_`/`ghs_`, `github_pat_`), AWS access key ids (`AKIA...`), Slack tokens (`xox[baprs]-`), Google API keys (`AIza...`), and PEM private keys with a key body.
- Ignores placeholders: values containing words like `example`, `your`, `placeholder`, `redacted`, `dummy`, `fake`, `sample`, `changeme` or `xxxx`, values with few distinct characters, and token-style values with no mix of letters and digits.
- On a hit, the call is denied with a message to Claude (kind of secret, preview masked to the first 4 characters) and a toast for you. Claude is told to use an environment variable, a secret store or a placeholder.

## Commands
| Command | Effect |
|---|---|
| `/secret-shield status` | Show whether the shield is on. |
| `/secret-shield off` | Allow secret-looking values for this session; status line shows `secret-shield: OFF`. |
| `/secret-shield on` | Turn it back on. |

## Install
```sh
claude --plugin-dir /path/to/ModsTools/mods/secret-shield
```

## Limits
- Pattern-based: unknown token formats and secrets without a recognised prefix pass; false positives are possible (use `/secret-shield off` after asking).
- Not covered: `NotebookEdit`, `MultiEdit`-style tools, and the `old_string` of `Edit`.
- Bash commands are checked as text: it does not see through `bash -c`, `$(...)`, `eval`, aliases or scripts. A seatbelt, not a security boundary.

## Develop
```sh
claude plugin validate mods/secret-shield
claude plugin test mods/secret-shield   # 34 tests
```
