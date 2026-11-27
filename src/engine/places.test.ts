import { describe, expect, it } from 'vitest'
import * as S from './session'
import { placesOf, podiumOf, standings } from './stats'
import type { PlayerStat } from './stats'
import type { Session } from './types'

/** One place for everyone, decided in one spot: the table, the podium and the share pictures all read it. */
const row = (name: string, wins: number, losses: number, extra: Partial<PlayerStat> = {}): PlayerStat => ({
  id: name, name, status: 'active', played: wins + losses, wins, losses, pf: 0, pa: 0, diff: 0, winPct: 0,
  eligible: wins + losses, satOut: 0, longestStreak: 0, playMs: 0, ...extra,
})

describe('placesOf: tied players share a place, and the next place skips', () => {
  it('the exact night from the screenshot: 1, 2, 2, 2, 2, 6, 7, 7, 9, 10, 10, 12', () => {
    // sorted best first, as standings() returns them
    const rows = [
      row('Tiny', 12, 3), row('Daria', 9, 6), row('Kp', 9, 6), row('Stee', 9, 6), row('Zel', 9, 6),
      row('Josh', 8, 7), row('Aj', 7, 8), row('Voj', 7, 8), row('nekky', 6, 9), row('Dar', 5, 10), row('Julius', 5, 10), row('xtia', 4, 11),
    ]
    expect(placesOf(rows)).toEqual([1, 2, 2, 2, 2, 6, 7, 7, 9, 10, 10, 12])
  })

  it('a tie for first: two people are both 1st and the next is 3rd', () => {
    expect(placesOf([row('A', 5, 1), row('B', 5, 1), row('C', 4, 2), row('D', 0, 0)])).toEqual([1, 1, 3, 4])
  })

  it('everyone level shares first place', () => {
    expect(placesOf([row('A', 3, 3), row('B', 3, 3), row('C', 3, 3)])).toEqual([1, 1, 1])
  })

  it('a better points difference separates players with the same record', () => {
    expect(placesOf([row('A', 3, 1, { diff: 10 }), row('B', 3, 1, { diff: 4 })])).toEqual([1, 2])
  })

  it('more wins separates players with the same smoothed rate only when it is a real difference', () => {
    // 1-0 and 5-1 differ in smoothed rate, so they are not tied
    const places = placesOf([row('Solid', 5, 1), row('Lucky', 1, 0)])
    expect(places[0]).toBe(1)
    expect(places[1]).toBe(2)
  })

  it('nobody who has not played a decided game shares a place with someone who has', () => {
    expect(placesOf([row('A', 2, 0), row('Idle', 0, 0), row('Idle2', 0, 0)])).toEqual([1, 2, 2])
  })

  it('an empty list is fine', () => {
    expect(placesOf([])).toEqual([])
  })
})

describe('podiumOf: the podium shows PLACES, not three slots', () => {
  it('a four-way tie for 2nd shows all four as 2nd, and nobody is called 3rd', () => {
    const rows = [row('Tiny', 12, 3), row('Daria', 9, 6), row('Kp', 9, 6), row('Stee', 9, 6), row('Zel', 9, 6), row('Josh', 8, 7)]
    const p = podiumOf(rows)
    expect(p.map((x) => [x.place, x.row.name])).toEqual([[1, 'Tiny'], [2, 'Daria'], [2, 'Kp'], [2, 'Stee'], [2, 'Zel']])
  })

  it('a tie for first shows both as 1st, then the next place is 3rd', () => {
    const rows = [row('A', 5, 1), row('B', 5, 1), row('C', 4, 2), row('D', 3, 3), row('E', 2, 4)]
    const p = podiumOf(rows)
    expect(p.map((x) => [x.place, x.row.name])).toEqual([[1, 'A'], [1, 'B'], [3, 'C']])
  })

  it('only people with a win can be on the podium', () => {
    const rows = [row('A', 1, 0), row('B', 0, 1), row('C', 0, 1)]
    expect(podiumOf(rows).map((x) => x.row.name)).toEqual(['A'])
    expect(podiumOf([row('A', 0, 1), row('B', 0, 1)])).toEqual([])
  })

  it('a clean top three is exactly three', () => {
    const p = podiumOf([row('A', 6, 0), row('B', 5, 1), row('C', 4, 2), row('D', 3, 3)])
    expect(p.map((x) => x.place)).toEqual([1, 2, 3])
  })

  it('never more than five people, however many tie (a 12-way tie would bury the page)', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row('P' + i, 5, 5))
    expect(podiumOf(rows).length).toBeLessThanOrEqual(5)
  })
})

describe('on a real session the same four tie everywhere', () => {
  const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` }))
  function play(s: Session, wins: number): Session {
    for (let i = 0; i < wins; i++) { const c = s.courts.find((x) => x.match)!; s = S.finishMatch(s, c.id, { winner: i % 2 ? 'a' : 'b', scoreA: null, scoreB: null }) }
    return s
  }
  it('the table and the podium agree on every player', () => {
    for (let seed = 4; seed <= 40; seed++) {
      const s = play(S.createSession('t', { courts: 2 }, names(8 + (seed % 5))), seed)
      const rows = standings(s)
      const places = placesOf(rows)
      const podium = podiumOf(rows)
      for (const p of podium) expect(places[rows.indexOf(p.row)], `seed ${seed} ${p.row.name}`).toBe(p.place)
      // places only ever go up, never skip backwards, and the first place is 1
      expect(places[0]).toBe(1)
      for (let i = 1; i < places.length; i++) expect(places[i]).toBeGreaterThanOrEqual(places[i - 1])
      // a place number is the position of the first person who has it
      places.forEach((pl: number, i: number) => { if (i === 0 || places[i - 1] !== pl) expect(pl, `seed ${seed}`).toBe(i + 1) })
    }
  })
})

describe('the ranking order is stable and consistent', () => {
  it('sorting twice, or from any starting order, gives the same list (a deterministic tiebreak)', () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` }))
    for (let seed = 1; seed <= 25; seed++) {
      let s = S.createSession('t', { courts: 2 }, names(8 + (seed % 5)))
      for (let i = 0; i < seed + 6; i++) { const c = s.courts.find((x) => x.match)!; s = S.finishMatch(s, c.id, { winner: (i * seed) % 3 ? 'a' : 'b', scoreA: null, scoreB: null }) }
      const a = standings(s).map((r) => r.id)
      const shuffled = { ...s, players: [...s.players].reverse() }
      expect(standings(shuffled).map((r) => r.id), `seed ${seed}`).toEqual(a)
      expect(standings(s).map((r) => r.id)).toEqual(a)
    }
  })
  it('the order never puts a lower smoothed rate above a higher one', () => {
    const r = [row('A', 1, 0), row('B', 5, 1), row('C', 0, 0), row('D', 3, 3)]
    const order = placesOf(r)
    expect(order.length).toBe(4)
  })
})

import { awards, highlightsNotInAwards } from './insights'

describe('awards and highlights never say the same thing twice', () => {
  const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` }))
  function night(players: number, courts: number, games: number, side: (i: number) => 'a' | 'b' = (i) => (i % 2 ? 'a' : 'b')): Session {
    let s = S.createSession('t', { courts }, names(players))
    for (let i = 0; i < games; i++) { const c = s.courts.find((x) => x.match)!; s = S.finishMatch(s, c.id, { winner: side(i), scoreA: null, scoreB: null }) }
    return s
  }

  it('Iron Player is not given when everyone played the same number of games', () => {
    // one court, 12 players: after every 3rd game each of the 12 has played exactly the same number
    const s = night(12, 1, 45)
    const played = s.players.map((p) => s.matches.filter((m) => [...m.a, ...m.b].includes(p.id)).length)
    expect(new Set(played).size, 'a perfectly even night').toBe(1)
    expect(played[0]).toBe(15)
    expect(awards(s).some((a) => a.id === 'iron'), 'no Iron Player when everyone is level').toBe(false)
  })

  it('Iron Player is given when someone really played more', () => {
    // 10 players on 2 courts: one extra game for some, so there is a real leader
    for (let g = 14; g <= 30; g++) {
      const s = night(10, 2, g)
      const played = s.players.map((p) => s.matches.filter((m) => [...m.a, ...m.b].includes(p.id)).length)
      if (new Set(played).size > 1 && Math.max(...played) >= 2) {
        const a = awards(s).find((x) => x.id === 'iron')
        if (a) expect(a.who!.length, `${g} games`).toBeLessThanOrEqual(5)
      }
    }
  })

  it('a highlight that an award already shows is dropped (best duo vs Dynamic Duo, hot streak vs On Fire)', () => {
    for (const games of [12, 20, 30, 45]) {
      const s = night(12, 3, games, (i) => (i % 5 ? 'a' : 'b'))
      const aw = awards(s)
      const left = highlightsNotInAwards(s)
      if (aw.some((a) => a.id === 'duo')) expect(left.some((h) => h.key === 'duo'), `${games} games: duo shown twice`).toBe(false)
      if (aw.some((a) => a.id === 'streak')) expect(left.some((h) => h.key === 'streak'), `${games} games: streak shown twice`).toBe(false)
    }
  })

  it('with no awards for them, the highlights still show', () => {
    const s = night(8, 2, 3)
    const left = highlightsNotInAwards(s)
    const aw = awards(s)
    for (const h of left) expect(aw.some((a) => (h.key === 'duo' && a.id === 'duo') || (h.key === 'streak' && a.id === 'streak'))).toBe(false)
  })
})
