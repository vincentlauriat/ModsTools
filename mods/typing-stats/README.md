# typing-stats

How much you type to Claude, and when: prompt counts per day, average prompt length and your busiest hours.

## What it does
- On each prompt you submit (typed at the terminal or sent through Remote Control), records for the local day:
  - the prompt count
  - the total number of characters
  - a 24-bucket histogram of the local hour
- **The prompt text is never stored**, only those three numbers.
- Prompts the person did not type (task notifications, other agents, plugins) and slash commands are not counted.
- Kept across sessions; days older than 90 days are dropped.

## Commands
| Command | Effect |
|---|---|
| `/typing-stats` | Today, the last 7 days (count per day with a bar), average prompt length, hour-of-day histogram and busiest hour |
| `/typing-stats week` | The same over the last 7 days, without the "Today" line |
| `/typing-stats month` | The same over the last 30 days |
| `/typing-stats reset` | Deletes all recorded stats |

Example:

```
Today: 8 prompts, 1160 characters (avg 145)

Last 7 days: 15 prompts
  Tue 09-29     0
  Wed 09-30     0
  Thu 10-01     4  ██████████
  Fri 10-02     1  ███
  Sat 10-03     0
  Sun 10-04     2  █████
  Mon 10-05     8  ████████████████████

Average prompt length: 133 characters

Hour of day (last 7 days):
  ▁▁▁▁▁▁▁▁▁▄▃▁▁▁█▁▁▁▁▁▁▁▂▁
  0     6     12    18   23
Busiest hour: 14:00-15:00 (9 prompts)
```

## Install

```sh
claude --plugin-dir /path/to/ModsTools/mods/typing-stats
```

## Limits
- Characters are counted on the prompt as it reaches the model, so pasted text is included.
- An empty hour and a very quiet one both look low: an empty hour is always `▁`, any hour with a prompt is at least `▂`.
- Day and hour are the machine's local time when the prompt is submitted.

## Develop

```sh
claude plugin validate mods/typing-stats
claude plugin test mods/typing-stats   # 12 tests
```
