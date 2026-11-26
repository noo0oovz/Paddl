import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as S from './session'
import { playerStandings } from './stats'
import type { Config, Session } from './types'

/**
 * Does nobody end up feeling shortchanged on playing time?
 *
 * Fairness here means: among the people who were PRESENT, everyone plays about the same number of games AND spends
 * about the same minutes on court, whoever joined late, rested, or was swapped out. Someone who was away cannot be
 * owed time they chose to miss, so each player is judged against their own time present.
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

const NAMES = ['Ana', 'Ben', 'Cara', 'Dan', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivy', 'Jo', 'Kai', 'Lia', 'Mo', 'Ned']
const MIN = 60_000

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T18:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

/**
 * A night with a real clock. Each game is given its length (6 to 16 minutes) the moment it starts. `game()` ends the
 * game that is due first and moves the clock to that moment, so two courts side by side stay consistent and the
 * minutes recorded on each match are what a stopwatch would have shown.
 */
class Night {
  s: Session
  r: () => number
  len = new Map<number, number>()
  constructor(public players: number, public courts: number, seed: number, cfg: Partial<Config> = {}) {
    this.r = rng(seed)
    this.s = S.createSession('t', { courts, ...cfg }, NAMES.slice(0, players).map((name) => ({ name })))
  }
  private due(c: { match: { gid?: number; startedAt: number } | null }): number {
    const m = c.match!
    const key = m.gid ?? 0
    if (!this.len.has(key)) this.len.set(key, (6 + this.r() * 10) * MIN)
    return m.startedAt + this.len.get(key)!
  }
  game(): boolean {
    const live = this.s.courts.filter((c) => c.match)
    if (!live.length) return false
    let next = live[0]
    for (const c of live) if (this.due(c) < this.due(next)) next = c
    const end = this.due(next)
    if (end > Date.now()) vi.setSystemTime(end)
    this.s = S.finishMatch(this.s, next.id, { winner: this.r() < 0.5 ? 'a' : 'b', scoreA: null, scoreB: null })
    return true
  }
  play(n: number) { for (let i = 0; i < n; i++) if (!this.game()) break }
  id(name: string) { return this.s.players.find((p) => p.name === name)!.id }
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

/** Per player: share of the games finished while present that they played, and minutes on court per present game. */
function rows(n: Night) {
  return playerStandings(n.s)
    .filter((p) => p.eligible >= 6)
    .map((p) => ({ name: p.name, share: p.played / p.eligible, minPerPresent: p.playMs / MIN / p.eligible, games: p.played, min: p.playMs / MIN }))
}
const spread = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0)

interface Scenario { label: string; make: (seed: number) => Night; who: string[] }

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)

const SCENARIOS: Scenario[] = [
  { label: 'nothing unusual (10 players, 2 courts)', who: [], make: (seed) => { const n = new Night(10, 2, seed); n.play(60); return n } },
  { label: 'late joiner after 12 games', who: ['Late'], make: (seed) => { const n = new Night(10, 2, seed); n.play(12); n.s = S.addPlayer(n.s, 'Late'); n.play(48); return n } },
  { label: 'one player rests 6 games then returns', who: ['Cara'], make: (seed) => { const n = new Night(10, 2, seed); n.play(8); n.s = S.setStatus(n.s, n.id('Cara'), 'resting'); n.play(6); n.s = S.setStatus(n.s, n.id('Cara'), 'active'); n.play(46); return n } },
  { label: 'one player rests 1 game (water break)', who: ['Cara'], make: (seed) => { const n = new Night(10, 2, seed); n.play(8); n.s = S.setStatus(n.s, n.id('Cara'), 'resting'); n.play(1); n.s = S.setStatus(n.s, n.id('Cara'), 'active'); n.play(51); return n } },
  { label: 'a player is swapped out of a live game', who: ['Ana'], make: (seed) => { const n = new Night(10, 2, seed); n.play(10); const out = n.s.courts.find((c) => c.match)!.match!.a[0]; n.s = S.pullOut(n.s, out); n.play(50); return n } },
  { label: 'a messy night: joiner, two breaks, a swap-out', who: ['Late', 'Cara', 'Dan'], make: (seed) => {
    const n = new Night(12, 3, seed); n.play(8)
    n.s = S.addPlayer(n.s, 'Late'); n.play(5)
    n.s = S.setStatus(n.s, n.id('Cara'), 'resting'); n.play(5)
    n.s = S.setStatus(n.s, n.id('Cara'), 'active'); n.play(4)
    n.s = S.setStatus(n.s, n.id('Dan'), 'resting'); n.play(3)
    n.s = S.setStatus(n.s, n.id('Dan'), 'active')
    n.s = S.pullOut(n.s, n.s.courts.find((c) => c.match)!.match!.a[0]); n.play(40)
    return n
  } },
]

describe('measure: nobody is shortchanged while present', () => {
  for (const sc of SCENARIOS) {
    it(sc.label, () => {
      const night = SEEDS.map((seed) => sc.make(seed))
      const games = night.map((n) => rows(n).map((r) => r.share))
      const named = night.map((n) => avg(rows(n).filter((r) => sc.who.includes(r.name)).map((r) => r.minPerPresent)))
      const group = night.map((n) => avg(rows(n).map((r) => r.minPerPresent)))
      const gap = night.map((n) => spread(rows(n).map((r) => r.minPerPresent)))
      const f = (x: number, d = 1) => x.toFixed(d).padStart(5)
      console.log(
        `${sc.label.padEnd(48)} games-share spread ${f(avg(games.map((g) => spread(g))) * 100, 0)}% | minutes per present game: group ${f(avg(group), 2)}` +
        `${sc.who.length ? ' person ' + f(avg(named), 2) : ''} | spread ${f(avg(gap), 2)} (worst night ${f(Math.max(...gap), 2)})`,
      )
      expect(night.length).toBe(SEEDS.length)
    })
  }
})

/** The longest run of games in a row that anyone plays without sitting one out. */
function longestRun(n: Night): number {
  let best = 0
  for (const p of n.s.players) {
    let run = 0
    for (const m of [...n.s.matches].sort((a, b) => a.seq - b.seq)) {
      if ([...m.a, ...m.b].includes(p.id)) { run++; best = Math.max(best, run) } else run = 0
    }
  }
  return best
}

describe('measure: back-to-back games', () => {
  const cases: [string, (seed: number) => Night][] = [
    ['10 players, 2 courts', (s) => { const n = new Night(10, 2, s); n.play(60); return n }],
    ['9 players, 2 courts (tight)', (s) => { const n = new Night(9, 2, s); n.play(60); return n }],
    ['12 players, 3 courts', (s) => { const n = new Night(12, 3, s); n.play(60); return n }],
    ['10 players, 2 courts, 6-game break', (s) => { const n = new Night(10, 2, s); n.play(8); n.s = S.setStatus(n.s, n.id('Cara'), 'resting'); n.play(6); n.s = S.setStatus(n.s, n.id('Cara'), 'active'); n.play(46); return n }],
    ['10 players, 2 courts, late joiner', (s) => { const n = new Night(10, 2, s); n.play(12); n.s = S.addPlayer(n.s, 'Late'); n.play(48); return n }],
  ]
  for (const [label, make] of cases) {
    it(label, () => {
      const runs = SEEDS.map((seed) => longestRun(make(seed)))
      console.log(`${label.padEnd(40)} longest run of games in a row: worst ${Math.max(...runs)}, nights with 3 or more in a row: ${runs.filter((r) => r >= 3).length}/${SEEDS.length}`)
      expect(runs.length).toBe(SEEDS.length)
    })
  }
})

describe('fairness rules that must keep holding', () => {
  it('a player swapped out of a live game keeps the place in line they had earned', () => {
    for (const seed of SEEDS) {
      const n = new Night(10, 2, seed); n.play(10)
      const court = n.s.courts.find((c) => c.match)!
      const out = court.match!.a[0]
      const lastBefore = n.s.players.find((p) => p.id === out)!.lastPlayed
      n.s = S.pullOut(n.s, out)
      expect(n.s.players.find((p) => p.id === out)!.lastPlayed, `seed ${seed}`).toBe(lastBefore)
    }
  })

  it('a cancelled game does not count as played for anyone', () => {
    const n = new Night(8, 2, 3); n.play(4)
    const c = n.s.courts.find((x) => x.match)!
    const ids = [...c.match!.a, ...c.match!.b]
    const before = new Map(ids.map((id) => [id, n.s.players.find((p) => p.id === id)!.lastPlayed]))
    n.s = S.cancelMatch(n.s, c.id)
    for (const id of ids) expect(n.s.players.find((p) => p.id === id)!.lastPlayed).toBe(before.get(id))
  })

  it('someone back from a long rest comes back level with the group, not ahead of it', () => {
    const extra: number[] = []
    for (const seed of SEEDS) {
      const n = new Night(10, 2, seed); n.play(8)
      n.s = S.setStatus(n.s, n.id('Cara'), 'resting'); n.play(6)
      n.s = S.setStatus(n.s, n.id('Cara'), 'active'); n.play(46)
      const r = rows(n)
      const me = r.find((x) => x.name === 'Cara')!
      extra.push(me.minPerPresent - avg(r.map((x) => x.minPerPresent)))
    }
    // on average within a few percent of an even share (it was +8% with the old two-game allowance)
    expect(Math.abs(avg(extra))).toBeLessThan(0.15)
  })

  it('a late joiner and a water break both end up with their fair share', () => {
    for (const make of [
      (seed: number) => { const n = new Night(10, 2, seed); n.play(12); n.s = S.addPlayer(n.s, 'Late'); n.play(48); return [n, 'Late'] as const },
      (seed: number) => { const n = new Night(10, 2, seed); n.play(8); n.s = S.setStatus(n.s, n.id('Cara'), 'resting'); n.play(1); n.s = S.setStatus(n.s, n.id('Cara'), 'active'); n.play(51); return [n, 'Cara'] as const },
    ]) {
      const diffs = SEEDS.map((seed) => { const [n, who] = make(seed); const r = rows(n); return r.find((x) => x.name === who)!.minPerPresent - avg(r.map((x) => x.minPerPresent)) })
      expect(Math.abs(avg(diffs))).toBeLessThan(0.2)
    }
  })

  it('the games count people see is real games played, not the catch-up credit', async () => {
    const { playedOf } = await import('./stats')
    const { countMatches } = await import('./stats')
    const n = new Night(10, 2, 4); n.play(14)
    n.s = S.addPlayer(n.s, 'Late')
    const late = n.s.players.find((p) => p.name === 'Late')!
    expect(late.baseGames).toBeGreaterThan(0) // they are credited for ordering the queue...
    expect(playedOf(late, countMatches(n.s.matches))).toBe(0) // ...but have really played nothing
  })

  it('the back-to-back limit, when on, never leaves a court empty and never overrides fewest games', () => {
    for (const seed of SEEDS) {
      const n = new Night(9, 2, seed, { maxInRow: 2 })
      for (let i = 0; i < 60; i++) {
        n.game()
        const idle = n.s.courts.filter((c) => !c.match).length
        const waiting = S.waitingCount(n.s)
        expect(idle === 0 || waiting < 4, `seed ${seed}: a court sat idle with ${waiting} waiting`).toBe(true)
      }
      const g = playerStandings(n.s).map((p) => p.played)
      expect(Math.max(...g) - Math.min(...g), `seed ${seed}`).toBeLessThanOrEqual(3)
    }
  })

  it('a saved session from before the limit existed behaves as if it were off', () => {
    const n = new Night(10, 2, 2)
    delete (n.s.config as { maxInRow?: number }).maxInRow
    n.play(30)
    expect(n.s.matches.length).toBe(30)
  })
})
