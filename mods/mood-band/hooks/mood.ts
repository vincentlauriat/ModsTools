export type MoodInput = { failed: number; total: number; ms: number; errored: boolean; idleMs: number }
export type Mood = { kind: 'happy' | 'focused' | 'worried' | 'sad' | 'sleepy'; face: string; caption: string }

export const LONG_TURN_MS = 120_000
export const SLEEP_MS = 30 * 60_000

const MOODS = {
  happy: { kind: 'happy', face: '(^‿^)', caption: 'Tout roule' },
  focused: { kind: 'focused', face: '(•̀ᴗ•́)', caption: 'Ça chauffe' },
  worried: { kind: 'worried', face: '(•_•;)', caption: 'Aïe' },
  sad: { kind: 'sad', face: '(╥﹏╥)', caption: 'Ça a coincé' },
  sleepy: { kind: 'sleepy', face: '(-_-) zzz', caption: 'Je dors' },
} as const satisfies Record<string, Mood>

export function pickMood({ failed, total, ms, errored, idleMs }: MoodInput): Mood {
  if (idleMs >= SLEEP_MS) return MOODS.sleepy
  if (errored || (total > 0 && failed * 2 > total)) return MOODS.sad
  if (failed > 0) return MOODS.worried
  if (ms >= LONG_TURN_MS) return MOODS.focused

  return MOODS.happy
}
