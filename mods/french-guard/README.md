# french-guard

Catches answers that drift out of properly accented French, for users who expect French replies.

## What it does
- After each main-agent answer, shows a toast when:
  - the answer looks English (at least 40 words, and English stopwords make up 65% or more of English plus French stopwords), or
  - it contains 3 or more French words written without their accents (`deja`, `probleme`, `resultat`…; the toast shows up to 4 examples).
- Code blocks, inline code, URLs, paths and file names are ignored.
- `/french-guard status` reports the outcome of the last check.

## Commands
| Command | Effect |
|---|---|
| `/french-guard off` / `on` | Disable / enable (default on) |
| `/french-guard status` | Shows on/off and the last check result |

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/french-guard
```

## Limits
- A heuristic based on stopword ratios and a list of about 50 unaccented words: it can miss cases or flag false positives.
- It only warns; it does not rewrite or block anything.

## Develop

```sh
claude plugin validate mods/french-guard
claude plugin test mods/french-guard   # 10 tests
```
