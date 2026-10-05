// ---------- Finding `git commit` in a shell line ----------

/** The words of each simple command of a shell line, quotes removed. */
export function shellWords(command: string): string[][] {
  const statements: string[][] = []
  let words: string[] = []
  let word = ''
  let inWord = false
  const endWord = () => {
    if (inWord) words.push(word)
    word = ''
    inWord = false
  }
  const endStatement = () => {
    endWord()
    if (words.length > 0) statements.push(words)
    words = []
  }

  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (c === "'") {
      const end = command.indexOf("'", i + 1)
      word += command.slice(i + 1, end === -1 ? undefined : end)
      inWord = true
      i = end === -1 ? command.length : end
    } else if (c === '"') {
      inWord = true
      for (i++; i < command.length && command[i] !== '"'; i++) {
        if (command[i] === '\\' && '"\\$`\n'.includes(command[i + 1] ?? 'x')) i++
        word += command[i] ?? ''
      }
    } else if (c === '\\') {
      if (command[i + 1] !== '\n') {
        word += command[i + 1] ?? ''
        inWord = true
      }
      i++
    } else if (c === ';' || c === '&' || c === '|' || c === '\n' || c === '(' || c === ')') endStatement()
    else if (c === ' ' || c === '\t') endWord()
    else {
      word += c
      inWord = true
    }
  }
  endStatement()

  return statements
}

const WRAPPERS = new Set(['rtk', 'env', 'command', 'time', 'nice', 'sudo'])

/**
 * The folder of the last `git commit` of the line, relative or absolute as written:
 * its `git -C` folder, else the last `cd` before it, else '' (the session folder).
 * Undefined when the line runs no `git commit`.
 */
export function commitDir(command: string): string | undefined {
  let cd = ''
  let found: string | undefined
  for (const words of shellWords(command)) {
    let i = 0
    for (;;) {
      while (words[i] !== undefined && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]!)) i++
      if (words[i] !== undefined && WRAPPERS.has(words[i]!)) i++
      else break
    }
    if (words[i] === 'cd') {
      const to = words[i + 1]
      if (to !== undefined && to !== '-') cd = joinDir(cd, to)
      continue
    }
    if (words[i] !== 'git') continue
    i++
    let dir = cd
    while (words[i]?.startsWith('-')) {
      if (words[i] === '-C' && words[i + 1] !== undefined) dir = joinDir(dir, words[i + 1]!)
      i += words[i] === '-C' || words[i] === '-c' ? 2 : 1
    }
    if (words[i] === 'commit') found = dir
  }

  return found
}

function joinDir(base: string, to: string): string {
  if (to.startsWith('/') || to.startsWith('~') || base === '') return to

  return `${base.replace(/\/+$/, '')}/${to}`
}

/** `dir` resolved against the session folder; `~` left to the caller. */
export function resolveDir(dir: string, cwd: string): string {
  if (dir === '') return cwd
  if (dir.startsWith('/')) return dir

  return `${cwd.replace(/\/+$/, '')}/${dir}`
}

// ---------- Reading `git show --numstat --format=%H%n%s HEAD` ----------

export type Commit = { hash: string; subject: string; files: number; insertions: number; deletions: number; ext: string }

/** Parses `git show --numstat --format=%H%n%s` output (machine format, the same in every locale). */
export function parseShow(out: string): Commit | null {
  const lines = out.split('\n')
  const hash = (lines[0] ?? '').trim()
  if (!/^[0-9a-f]{7,64}$/.test(hash)) return null
  const subject = (lines[1] ?? '').trim()
  let files = 0
  let insertions = 0
  let deletions = 0
  const weight = new Map<string, number>()
  for (const line of lines.slice(2)) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
    if (m === null) continue
    files++
    const add = m[1] === '-' ? 0 : Number(m[1])
    const del = m[2] === '-' ? 0 : Number(m[2])
    insertions += add
    deletions += del
    const ext = extensionOf(m[3]!)
    weight.set(ext, (weight.get(ext) ?? 0) + add + del + 1)
  }
  let ext = ''
  let best = -1
  for (const [e, w] of weight) {
    if (w > best) {
      ext = e
      best = w
    }
  }

  return { hash, subject, files, insertions, deletions, ext }
}

/** Lower-case extension of a numstat path (renames `a => b` and `{a => b}` take the new name). */
export function extensionOf(path: string): string {
  const target = path.includes('=>') ? path.replace(/\{[^{}]*=> ([^{}]*)\}/, '$1').split(' => ').pop()! : path
  const base = target.split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')

  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function commitType(subject: string): string {
  const m = /^([a-z]+)(\([^()]*\))?!?:/i.exec(subject.trim())

  return m === null ? 'other' : m[1]!.toLowerCase()
}

// ---------- Syllables ----------

/** Approximate English syllables of a word: vowel groups, minus silent endings, plus a few hiatuses. */
export function wordSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w === '') return 0
  if (w.length <= 3) return 1
  if (/[^aeiouy]es$/.test(w) && !/(?:[sxzcg]|ch|sh)es$/.test(w)) w = w.slice(0, -2) // files, rules (not pages)
  else if (/[^aeiouytd]ed$/.test(w)) w = w.slice(0, -2) // changed (not mended)
  else if (/[^aeiouy]e$/.test(w)) w = w.slice(0, -1) // shape, single
  w = w.replace(/^y/, '')
  let n = w.match(/[aeiouy]+/g)?.length ?? 0
  if (/[^aeiouyl]l$/.test(w)) n++ // single, settles
  if (/iet|ia(?!n)|uou/.test(w)) n++ // quiet, dial

  return Math.max(1, n)
}

export const lineSyllables = (line: string) => line.split(/[\s-]+/).reduce((s, w) => s + wordSyllables(w), 0)

/**
 * A model's reply as three haiku lines, or null when it is not one: three short
 * non-empty lines, each within two syllables of 5-7-5 by the approximate count.
 */
export function asHaiku(reply: string): string[] | null {
  const lines = reply
    .split('\n')
    .map(l => l.trim().replace(/^["'`*_>\-\s]+|["'`*_\s]+$/g, ''))
    .filter(l => l !== '')
  if (lines.length !== 3) return null
  const target = [5, 7, 5]
  const ok = lines.every((l, i) => l.length <= 48 && Math.abs(lineSyllables(l) - target[i]!) <= 2)

  return ok ? lines : null
}

// ---------- Template haiku ----------

/** A fragment and its syllable count (stated, so proper nouns count right). */
type Frag = [text: string, syllables: number]

export const LINE1: Record<string, string[]> = {
  feat: ['a new branch unfolds', 'something new takes root', 'fresh code greets the dawn'],
  fix: ['a crack is mended', 'the bug flies away', 'one less thorn tonight'],
  docs: ['words fall like soft rain', 'ink dries on the page', 'the readme grows wise'],
  style: ['the spaces align', 'neat rows, combed and clean', 'the lint sighs in peace'],
  refactor: ['old walls rearranged', 'same house, with new rooms', 'the shape shifts, still whole'],
  perf: ['the loop runs swifter', 'less waiting today', 'speed hums in the wire'],
  test: ['a new test stands guard', 'green lights in a row', 'the checks keep watch now'],
  build: ['the scaffold is changed', 'the build learns new steps', 'gears turn in the night'],
  ci: ['the pipeline wakes up', 'robots check the gate', 'the green lights wait now'],
  chore: ['small chores, done with care', 'sweeping the workshop', 'the dust is cleared off'],
  revert: ['footsteps walked backward', 'undone, as before', 'time flows in reverse'],
  other: ['a commit is made', 'the tree grows a ring', 'one more step taken'],
}

const NUMBERS: Frag[] = [
  ['zero', 2], ['one', 1], ['two', 1], ['three', 1], ['four', 1], ['five', 1],
  ['six', 1], ['seven', 2], ['eight', 1], ['nine', 1], ['ten', 1],
]

/** "a single file", "three files", "many files": the line-2 subject. */
export function filesPhrase(files: number): Frag {
  if (files === 1) return ['a single file', 4]
  const n = NUMBERS[files]
  if (n !== undefined) return [`${n[0]} files`, n[1] + 1]

  return ['so many files', 4]
}

export const LINE2_TAIL: Record<number, string[]> = {
  3: ['shift and sigh', 'drift and turn', 'wake and stretch'],
  4: ['drift in the wind', 'stir in the dusk', 'change in the dark'],
  5: ['changed in quiet light', 'moved by patient hands', 'stirred by morning wind'],
}

/** Line-2 tails after "a single file" (singular verbs, 3 syllables). */
export const LINE2_TAIL_ONE = ['shifts and sighs', 'drifts and turns', 'stirs and wakes']

export const LANGUAGES: Record<string, Frag> = {
  ts: ['TypeScript', 2], tsx: ['TypeScript', 2], js: ['JavaScript', 3], jsx: ['JavaScript', 3], mjs: ['JavaScript', 3],
  swift: ['Swift', 1], py: ['Python', 2], md: ['markdown', 2], json: ['JSON', 2], rs: ['Rust', 1], go: ['Go', 1],
  sh: ['shell', 1], zsh: ['shell', 1], css: ['styles', 1], html: ['markup', 2], yml: ['YAML', 2], yaml: ['YAML', 2],
  java: ['Java', 2], kt: ['Kotlin', 2], rb: ['Ruby', 2], c: ['C', 1], h: ['C', 1], cpp: ['C plus plus', 3], sql: ['SQL', 3],
}

export const LINE3_TAIL: Record<number, string[]> = {
  2: ['at rest', 'sleeps now', 'holds firm'],
  3: ['sleeps at dusk', 'rests at last', 'settles down'],
  4: ['rests in the dusk', 'sleeps under stars', 'hums in the dark'],
}

export const BALANCE: Record<'grow' | 'shrink' | 'even', string[]> = {
  grow: ['the code grows longer', 'new lines bloom like moss', 'the garden widens'],
  shrink: ['less is more today', 'dead leaves swept away', 'lighter than before'],
  even: ['lines come, lines depart', 'give and take, in turn', 'the scales hold steady'],
}

/** FNV-1a over the commit hash: stable variant choice per commit. */
export function hashOf(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }

  return h
}

const pick = <T>(list: readonly T[], seed: number): T => list[seed % list.length]!

/** A 5-7-5 haiku from the commit's type, file count, insertions/deletions and main extension. */
export function templateHaiku(c: Commit): string[] {
  const h = hashOf(c.hash)
  const line1 = pick(LINE1[commitType(c.subject)] ?? LINE1.other!, h)
  const [files, fs] = filesPhrase(c.files)
  const line2 = `${files} ${pick(c.files === 1 ? LINE2_TAIL_ONE : LINE2_TAIL[7 - fs]!, h >>> 3)}`
  const lang = LANGUAGES[c.ext]
  let line3: string
  if (lang !== undefined && ((h >>> 6) & 1) === 0) {
    line3 = `${lang[0]} ${pick(LINE3_TAIL[5 - lang[1]]!, h >>> 7)}`
  } else {
    const kind = c.insertions > c.deletions * 2 ? 'grow' : c.deletions > c.insertions * 2 ? 'shrink' : 'even'
    line3 = pick(BALANCE[kind], h >>> 9)
  }

  return [capitalize(line1), line2, line3]
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function modelPrompt(c: Commit): string {
  return [
    'Write one haiku in English about this git commit: exactly three lines of 5, 7 and 5 syllables.',
    'Reply with the three lines only: no title, no quotes, no commentary.',
    '',
    `Subject: ${c.subject.slice(0, 200)}`,
    `Files changed: ${c.files}, +${c.insertions} -${c.deletions}${c.ext === '' ? '' : `, mostly .${c.ext}`}`,
  ].join('\n')
}
