import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as S from './session'
import type { Config, Session } from './types'

/**
 * Do players get to play with and against most of the others?
 *
 * What was measured (and why these limits are not 100%):
 *  - With EXACTLY one full group waiting and nothing ever changing (12 players on 2 courts, 8 on 2, 16 on 2), the
 *    queue has no choice to make, so the same groups of four come round again and again. That perfect, never
 *    interrupted night barely exists: a late joiner, a break, a swap-out, or a Remix on a court game breaks the
 *    groups up. These tests make sure that stays true.
 *  - Making the queue mix such a perfect night was tried four ways. Each one either did nothing or made the match
 *    shown "on deck" differ from the one that starts, so it was not shipped.
 *
 * Games have real lengths (6 to 16 minutes) on a fake clock, so courts finish at different times like a real night.
 */
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
const NAMES = ['Ana', 'Ben', 'Cara', 'Dan', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivy', 'Jo', 'Kai', 'Lia', 'Mo', 'Ned', 'Oz', 'Pia']
const MIN = 60_000
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1)
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T18:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)

/** Plays `games` games. `act` runs after each one (a break, a late joiner, a Remix...). Returns the share of all pairs met. */
function share(n: number, courts: number, games: number, cfg: Partial<Config>, seed: number, act: (s: Session, g: number) => Session = (s) => s): number {
  const r = rng(seed)
  let s = S.createSession('t', { courts, ...cfg }, NAMES.slice(0, n).map((name) => ({ name })))
  const len = new Map<number, number>()
  const due = (c: { match: { gid?: number; startedAt: number } | null }) => {
    const k = c.match!.gid ?? 0
    if (!len.has(k)) len.set(k, (6 + r() * 10) * MIN)
    return c.match!.startedAt + len.get(k)!
  }
  for (let g = 0; g < games; g++) {
    const live = s.courts.filter((c) => c.match)
    if (!live.length) break
    let next = live[0]
    for (const c of live) if (due(c) < due(next)) next = c
    const end = due(next)
    if (end > Date.now()) vi.setSystemTime(end)
    s = S.finishMatch(s, next.id, { winner: r() < 0.5 ? 'a' : 'b', scoreA: null, scoreB: null })
    s = act(s, g)
  }
  const met = new Set<string>()
  for (const x of s.matches) {
    if (cfg.format === 'singles') met.add([x.a[0], x.b[0]].sort().join())
    else for (const t of [x.a, x.b]) if (t.length === 2) met.add([...t].sort().join())
  }
  const m = s.players.length
  return met.size / ((m * (m - 1)) / 2)
}
const mean = (n: number, courts: number, games: number, cfg: Partial<Config>, act?: (s: Session, g: number) => Session) =>
  avg(SEEDS.map((seed) => share(n, courts, games, cfg, seed, act)))

describe('with spare players, everyone mixes', () => {
  it.each([
    ['fair, 9 players on 2 courts', 9, 2, {}, 60],
    ['fair, 10 players on 2 courts', 10, 2, {}, 60],
    ['fair, 14 players on 3 courts', 14, 3, {}, 90],
    ['round robin, 10 players on 2 courts', 10, 2, { mode: 'robin' as const }, 60],
    ['singles, 9 players on 2 courts', 9, 2, { format: 'singles' as const }, 60],
  ])('%s: nearly every pair meets', (_label, n, courts, cfg, games) => {
    expect(mean(n, courts, games, cfg)).toBeGreaterThanOrEqual(0.9)
  })
})

describe('a real night breaks up the fixed groups', () => {
  it('12 players on 2 courts with a break, a late arrival, a swap-out and a Remix: nearly everyone meets', () => {
    const act = (s: Session, g: number): Session => {
      if (g === 10) s = S.setStatus(s, s.players[2].id, 'resting')
      if (g === 16) s = S.setStatus(s, s.players[2].id, 'active')
      if (g === 22) s = S.addPlayer(s, 'Late')
      if (g === 30) { const c = s.courts.find((x) => x.match); if (c) s = S.pullOut(s, c.match!.a[0]) }
      if (g % 14 === 13) s = S.remixNext(s)
      return s
    }
    expect(mean(12, 2, 70, {}, act)).toBeGreaterThanOrEqual(0.9)
  })

  it('one late joiner is enough to mix 12 players (doubles) or 8 players (singles)', () => {
    expect(mean(12, 2, 70, {}, (s, g) => (g === 12 ? S.addPlayer(s, 'Late') : s))).toBeGreaterThanOrEqual(0.9)
    expect(mean(8, 2, 60, { format: 'singles' }, (s, g) => (g === 10 ? S.addPlayer(s, 'Late') : s))).toBeGreaterThanOrEqual(0.8)
  })

  it('remixing a game that is on court mixes the groups: every 10 games is enough', () => {
    const act = (s: Session, g: number): Session => {
      if (g % 10 !== 9) return s
      const c = s.courts.find((x) => x.match)
      return c ? S.remixCourt(s, c.id) : s
    }
    expect(mean(12, 2, 70, {}, act)).toBeGreaterThanOrEqual(0.75)
  })

  it('a break of several games also breaks the groups up', () => {
    const act = (s: Session, g: number): Session => (g === 10 ? S.setStatus(s, s.players[2].id, 'resting') : g === 16 ? S.setStatus(s, s.players[2].id, 'active') : s)
    expect(mean(12, 2, 70, {}, act)).toBeGreaterThanOrEqual(0.7)
  })
})

describe('the known limit (documented, so a change to it is noticed)', () => {
  it('a perfectly uninterrupted night with exactly one group waiting stays in its groups', () => {
    // 12 on 2 courts: three groups of four. If this ever rises well above a third, the queue has started to mix such
    // nights, and the "what is shown on deck is exactly what starts" tests must be checked at the same time.
    const v = mean(12, 2, 90, {})
    expect(v).toBeLessThan(0.5)
    expect(v).toBeGreaterThan(0.2)
  })
})
