import { describe, expect, it } from 'vitest'
import * as S from './session'
import { playerStandings } from './stats'
import type { Session } from './types'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A realistic night: courts finish roughly in the order they started, with some jitter (a long rally, a slow
 * score), and several can finish in a burst. A court is never ignored for the whole night.
 */
function night(players: number, courts: number, games: number, seed: number): Session {
  const r = rng(seed)
  let s = S.createSession('crowd', { courts }, Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}` })))
  const order: string[] = s.courts.map((c) => c.id)
  const skipped = new Map<string, number>()
  for (let i = 0; i < games; i++) {
    const live = order.filter((id) => s.courts.find((c) => c.id === id)?.match)
    if (!live.length) break
    // The court running longest usually ends next. About one time in four the next one ends first, so courts
    // sometimes swap places, but no court can be skipped twice in a row (every game ends in reasonable time).
    const swap = live.length > 1 && r() < 0.25 && skipped.get(live[0]) !== 1
    const id = swap ? live[1] : live[0]
    skipped.set(live[0], swap ? 1 : 0)
    order.splice(order.indexOf(id), 1)
    order.push(id)
    s = S.finishMatch(s, id, { winner: r() < 0.5 ? 'a' : 'b', scoreA: null, scoreB: null })
  }
  return s
}

describe('a crowded night stays fair', () => {
  for (const [players, courts] of [[36, 6], [30, 5], [24, 4], [18, 3], [14, 2], [10, 2], [9, 2], [13, 3]] as const) {
    it(`${players} players on ${courts} courts: nobody falls more than 3 games behind`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const s = night(players, courts, players * 4, seed)
        const g = playerStandings(s).map((p) => p.played)
        expect(Math.max(...g) - Math.min(...g), `seed ${seed}: ${g.join(',')}`).toBeLessThanOrEqual(3)
      }
    })
  }
})
