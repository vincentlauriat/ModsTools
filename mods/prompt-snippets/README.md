# prompt-snippets

Reusable prompt fragments, kept across sessions and expanded inline with `;;name`.

## What it does
- Stores snippets in the mod's persistent store (survives sessions).
- When you submit a prompt containing `;;name`, replaces each token with the snippet text before Claude sees it.
- A `;;name` glued to a preceding letter, digit, `_`, `-` or `;` is left alone. Unknown names are left as typed and listed in a toast.
- Names use `a-z`, `0-9`, `_` and `-`. Prompts starting with `/snip` are not expanded.

## Commands
| Command | Effect |
|---|---|
| `/snip add <name> <text>` | Save (or overwrite) a snippet |
| `/snip rm <name>` | Remove a snippet |
| `/snip list` | List snippet names (default when no argument) |
| `/snip show <name>` | Print a snippet's text |

Example: `/snip add review Review this diff for bugs and missing tests.` then type `;;review` in a prompt.

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/prompt-snippets
```

## Limits
- Read-modify-write on the store: two sessions saving at once may lose an entry.
- A turn started by a slash command may be logged as `(no prompt)` elsewhere; snippets expand only in typed prompts.
- No nested expansion: a snippet containing `;;other` is inserted as is.

## Develop

```sh
claude plugin validate mods/prompt-snippets
claude plugin test mods/prompt-snippets   # 10 tests
```
