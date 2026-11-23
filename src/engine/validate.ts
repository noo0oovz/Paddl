import type { Config } from './types'

/** Returns an error message, or null when the score is a legal finished game. */
export function validateScore(a: number, b: number, cfg: Pick<Config, 'target' | 'winBy2' | 'cap'>): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Scores must be whole numbers'
  if (a === b) return 'A game cannot end in a tie'
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  if (hi < cfg.target) return `Winner needs at least ${cfg.target}`
  if (cfg.cap && hi > cfg.cap) return `Score cannot go above ${cfg.cap}`
  const capped = cfg.cap !== null && hi === cfg.cap
  if (cfg.winBy2 && !capped) {
    if (hi - lo < 2) return 'Must win by 2'
    if (hi > cfg.target && hi - lo !== 2) return `Past ${cfg.target} the game ends at a 2-point lead`
  }
  return null
}
