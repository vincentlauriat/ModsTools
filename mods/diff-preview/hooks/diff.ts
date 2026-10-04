import type { DiffSnapshot } from '../types'

export const NOT_A_REPO = 'not a git repository'

const lines = (text: string) => text.split('\n').filter(line => line.trim() !== '')

// `git diff --stat` output plus the `??` lines of `git status --porcelain`.
export const snapshot = (stat: string, porcelain: string): DiffSnapshot => ({
  error: null,
  stat: lines(stat),
  untracked: lines(porcelain).filter(line => line.startsWith('??')).length,
})

export const failed = (error: string): DiffSnapshot => ({ error, stat: [], untracked: 0 })

export const untrackedLabel = (count: number) => `${count} untracked file${count === 1 ? '' : 's'}`
