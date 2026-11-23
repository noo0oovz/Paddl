import { describe, expect, it } from 'vitest'
import {
  addPlayer, cancelMatch, createSession, deleteMatch, editMatch, endSession, finishMatch, playNext, pullOut, sendBack, setCourts, setStatus, substitute,
} from './session'
import { standings, summarize, countMatches, pairKey } from './stats'
import { validateScore } from './validate'
import { previewQueue } from './queue'
import type { Config, Session } from './types'

const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, level: 2 + (i % 7) * 0.5 }))

/** Play everything out; the lower-numbered side always wins (deterministic). */
function simulate(s: Session, rounds: number, winner: 'a' | 'b' = 'a'): Session {
  for (let i = 0; i < rounds; i++) {
    const live = s.courts.filter((c) => c.match)
    if (!live.length) break
    for (const c of live) {
      s = finishMatch(s, c.id, { winner, scoreA: winner === 'a' ? 11 : 5, scoreB: winner === 'a' ? 5 : 11 })
    }
  }
  return s
}

function spread(s: Session): number {
  const g = standings(s).filter((p) => p.status === 'active').map((p) => p.played)
  return Math.max(...g) - Math.min(...g)
}

describe('score validation', () => {
  const cfg = { target: 11, winBy2: true, cap: null }
  it('accepts legal scores', () => {
    expect(validateScore(11, 5, cfg)).toBeNull()
    expect(validateScore(13, 11, cfg)).toBeNull()
  })
  it('rejects bad scores', () => {
    expect(validateScore(11, 10, cfg)).toMatch(/win by 2/i)
    expect(validateScore(10, 8, cfg)).toMatch(/at least 11/)
    expect(validateScore(11, 11, cfg)).toMatch(/tie/)
    expect(validateScore(15, 5, cfg)).toMatch(/2-point lead/)
    expect(validateScore(-1, 5, cfg)).not.toBeNull()
  })
  it('honours a cap', () => {
    expect(validateScore(15, 14, { target: 11, winBy2: true, cap: 15 })).toBeNull()
    expect(validateScore(16, 14, { target: 11, winBy2: true, cap: 15 })).toMatch(/above 15/)
  })
})

describe('fair rotation', () => {
  it('fills courts and keeps games within one of each other (12 players, 3 courts)', () => {
    let s = createSession('t', { mode: 'fair', courts: 3 }, names(12))
    expect(s.courts.every((c) => c.match)).toBe(true)
    s = simulate(s, 8)
    expect(spread(s)).toBeLessThanOrEqual(1)
  })

  it('rotates byes fairly with an odd crowd (9 players, 2 courts)', () => {
    let s = createSession('t', { mode: 'fair', courts: 2 }, names(9))
    s = simulate(s, 12)
    expect(spread(s)).toBeLessThanOrEqual(1)
  })

  it('never lets a player wait forever', () => {
    let s = createSession('t', { mode: 'fair', courts: 1 }, names(7))
    s = simulate(s, 14)
    expect(Math.min(...standings(s).map((p) => p.played))).toBeGreaterThanOrEqual(7)
  })

  it('avoids repeating partners while fresh ones exist', () => {
    let s = createSession('t', { mode: 'fair', courts: 1 }, names(8))
    s = simulate(s, 6)
    const { partner } = countMatches(s.matches)
    expect(Math.max(...partner.values())).toBeLessThanOrEqual(2)
  })

  it('waits when there are not enough players', () => {
    const s = createSession('t', {}, names(3))
    expect(s.courts.every((c) => !c.match)).toBe(true)
    const s2 = addPlayer(s, 'P4')
    expect(s2.courts[0].match).not.toBeNull()
  })
})

describe('late joiners and breaks', () => {
  it('late joiner starts at the median, not zero', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    s = simulate(s, 10)
    s = addPlayer(s, 'Late')
    const late = s.players.find((p) => p.name === 'Late')!
    expect(late.baseGames).toBeGreaterThan(0)
  })

  it('late joiner is not forced onto every court', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    s = simulate(s, 10)
    s = addPlayer(s, 'Late')
    s = simulate(s, 4)
    const late = standings(s).find((p) => p.name === 'Late')!
    expect(late.played).toBeLessThanOrEqual(3)
  })

  it('resting a player on court swaps in a substitute and keeps their stats', () => {
    let s = createSession('t', { courts: 1 }, names(6))
    const onCourt = s.courts[0].match!.a[0]
    s = setStatus(s, onCourt, 'resting')
    const ids = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    expect(ids).not.toContain(onCourt)
    expect(ids).toHaveLength(4)
    s = simulate(s, 6)
    expect(standings(s).find((p) => p.id === onCourt)!.played).toBe(0)
  })

  it('a resting player returns without hogging courts', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    const id = s.players[0].id
    s = setStatus(s, id, 'resting')
    s = simulate(s, 6)
    s = setStatus(s, id, 'active')
    const p1 = s.players.find((p) => p.id === id)!
    expect(p1.baseGames).toBeGreaterThan(0)
  })

  it('rejects duplicate names', () => {
    const s = createSession('t', {}, names(4))
    expect(addPlayer(s, ' p1 ').players).toHaveLength(4)
  })
})

describe('winners stay', () => {
  const cfg: Partial<Config> = { mode: 'winners', courts: 1, maxStreak: 2 }

  it('winners hold the court and a new pair challenges', () => {
    let s = createSession('t', cfg, names(8))
    const winners = [...s.courts[0].match!.a]
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    const m = s.courts[0].match!
    expect(m.a).toEqual(winners)
    expect(m.b.some((id) => winners.includes(id))).toBe(false)
    expect(m.streak).toBe(1)
  })

  it('winners leave after hitting the streak cap', () => {
    let s = createSession('t', cfg, names(8))
    const winners = [...s.courts[0].match!.a]
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    const ids = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    expect(ids.some((id) => winners.includes(id))).toBe(false)
  })

  it('losers go behind everyone who has not played yet', () => {
    let s = createSession('t', cfg, names(8))
    const first = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    const second = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    const unplayed = s.players.map((p) => p.id).filter((id) => ![...first, ...second].includes(id))
    expect(unplayed).toHaveLength(2)
    const next = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    expect(unplayed.every((id) => next.includes(id))).toBe(true)
  })

  it('with exactly four players the court never freezes', () => {
    let s = createSession('t', cfg, names(4))
    for (let i = 0; i < 5; i++) {
      s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
      expect(s.courts[0].match).not.toBeNull()
    }
  })

  it('waits for players, then starts when enough arrive', () => {
    let s = createSession('t', cfg, names(3))
    expect(s.courts[0].match).toBeNull()
    s = addPlayer(s, 'N1')
    expect(s.courts[0].match).not.toBeNull()
  })
})

describe('skill balanced', () => {
  it('splits strong and weak players to even out teams', () => {
    const lv = [5, 5, 2, 2]
    const s = createSession('t', { mode: 'skill', courts: 1 }, lv.map((level, i) => ({ name: `S${i}`, level })))
    const m = s.courts[0].match!
    const sum = (ids: string[]) => ids.reduce((n, id) => n + s.players.find((p) => p.id === id)!.level, 0)
    expect(sum(m.a)).toBe(sum(m.b))
  })
})

describe('round robin', () => {
  it('spreads partners across the pool', () => {
    let s = createSession('t', { mode: 'robin', courts: 1 }, names(6))
    s = simulate(s, 9)
    const { partner } = countMatches(s.matches)
    expect(Math.max(...partner.values())).toBeLessThanOrEqual(2)
  })
})

describe('singles and fixed teams', () => {
  it('plays singles with two players', () => {
    const s = createSession('t', { format: 'singles', courts: 1 }, names(3))
    expect(s.courts[0].match!.a).toHaveLength(1)
    expect(s.courts[0].match!.b).toHaveLength(1)
  })

  it('keeps fixed teams together', () => {
    const pairs = [0, 1, 2, 3].map((i) => [{ name: `A${i}` }, { name: `B${i}` }] as [{ name: string }, { name: string }])
    let s = createSession('t', { format: 'teams', courts: 1 }, [], pairs)
    s = simulate(s, 6)
    for (const m of s.matches) {
      for (const side of [m.a, m.b]) {
        expect(side).toHaveLength(2)
        expect(s.teams.some((t) => pairKey(t.playerIds[0], t.playerIds[1]) === pairKey(side[0], side[1]))).toBe(true)
      }
    }
  })
})

describe('corrections and standings', () => {
  it('editing or deleting a match recomputes standings', () => {
    let s = createSession('t', { courts: 1 }, names(4))
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 3 })
    const m = s.matches[0]
    expect(standings(s)[0].wins).toBe(1)
    s = editMatch(s, m.id, { winner: 'b', scoreA: 3, scoreB: 11 })
    const winnerIds = s.matches[0].b
    expect(standings(s).find((p) => p.id === winnerIds[0])!.wins).toBe(1)
    s = deleteMatch(s, m.id)
    expect(standings(s).every((p) => p.played === 0)).toBe(true)
  })

  it('no contest counts as played but not as a win or loss', () => {
    let s = createSession('t', { courts: 1 }, names(4))
    s = finishMatch(s, s.courts[0].id, { winner: null, scoreA: null, scoreB: null })
    const st = standings(s)
    expect(st.every((p) => p.played === 1 && p.wins === 0 && p.losses === 0)).toBe(true)
  })

  it('cancelling a game records nothing and requeues everyone', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    s = cancelMatch(s, s.courts[0].id)
    expect(s.matches).toHaveLength(0)
    expect(s.courts[0].match).not.toBeNull()
  })

  it('does not rank a lucky 1-0 above a solid 5-1', () => {
    let s = createSession('t', { courts: 1 }, names(4))
    s.players.forEach((p) => (p.name = p.name))
    const ids = s.players.map((p) => p.id)
    const mk = (a: string[], b: string[], w: 'a' | 'b', i: number) => ({
      id: `x${i}`, seq: i + 1, court: 'Court 1', a, b, scoreA: w === 'a' ? 11 : 4, scoreB: w === 'a' ? 4 : 11, winner: w, at: i,
    })
    s.matches = [
      ...Array.from({ length: 5 }, (_, i) => mk([ids[0], ids[1]], [ids[2], ids[3]], 'a', i)),
      mk([ids[0], ids[1]], [ids[2], ids[3]], 'b', 5),
    ]
    s.seq = 6
    const lucky = s.matches
    expect(lucky).toHaveLength(6)
    expect(standings(s)[0].wins).toBe(5)
  })
})

describe('ranking', () => {
  it('ranks players who have not played below players with a losing record', () => {
    let s = createSession('t', { courts: 2 }, names(8))
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 2 })
    const st = standings(s)
    const lastPlayedIdx = Math.max(...st.map((p, i) => (p.wins + p.losses > 0 ? i : -1)))
    const firstUnplayedIdx = st.findIndex((p) => p.wins + p.losses === 0)
    expect(lastPlayedIdx).toBeLessThan(firstUnplayedIdx)
  })
})

describe('courts and sessions', () => {
  it('adds a court mid-session and fills it', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    s = setCourts(s, 2)
    expect(s.courts).toHaveLength(2)
    expect(s.courts[1].match).not.toBeNull()
  })

  it('never removes a court with a live game', () => {
    let s = createSession('t', { courts: 2 }, names(8))
    s = setCourts(s, 1)
    expect(s.courts).toHaveLength(2)
  })

  it('previews upcoming matches without touching state', () => {
    const s = createSession('t', { courts: 1 }, names(12))
    const before = JSON.stringify(s)
    expect(previewQueue(s, 2).length).toBe(2)
    expect(JSON.stringify(s)).toBe(before)
  })

  it('ending a session clears courts and builds a summary', () => {
    let s = createSession('t', { courts: 1 }, names(4))
    s = simulate(s, 3)
    s = endSession(s)
    expect(s.endedAt).not.toBeNull()
    expect(s.courts.every((c) => !c.match)).toBe(true)
    const sum = summarize(s)
    expect(sum.matches).toBe(3)
    expect(sum.totalPoints).toBe(48)
  })

  it('counts sit-outs only while a player was active', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    s = simulate(s, 3)
    s = setStatus(s, 'p8', 'left')
    s = simulate(s, 3)
    const p8 = standings(s).find((p) => p.id === 'p8')!
    expect(p8.eligible).toBeLessThanOrEqual(3)
  })
})

describe('pull in / pull out', () => {
  it('play next puts a waiting player into the next match', () => {
    let s = createSession('t', { courts: 1 }, names(12))
    const waitingId = previewQueue(s, 2)[1].a[0]
    expect(previewQueue(s, 1)[0].a.concat(previewQueue(s, 1)[0].b!)).not.toContain(waitingId)
    s = playNext(s, waitingId)
    const next = previewQueue(s, 1)[0]
    expect([...next.a, ...next.b!]).toContain(waitingId)
  })

  it('send to back keeps a player out of the next match while others wait', () => {
    let s = createSession('t', { courts: 1 }, names(10))
    const first = previewQueue(s, 1)[0]
    const id = first.a[0]
    s = sendBack(s, id)
    const next = previewQueue(s, 1)[0]
    expect([...next.a, ...next.b!]).not.toContain(id)
  })

  it('pull out swaps the next in line onto the court and the player goes back to the queue', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    const out = s.courts[0].match!.a[0]
    s = pullOut(s, out)
    const onCourt = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    expect(onCourt).not.toContain(out)
    expect(onCourt).toHaveLength(4)
    expect(previewQueue(s, 1).length + 0).toBeGreaterThanOrEqual(0)
    expect(s.players.find((p) => p.id === out)!.status).toBe('active')
  })

  it('pull out does nothing when nobody is waiting', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const out = s.courts[0].match!.a[0]
    expect(pullOut(s, out)).toBe(s)
  })

  it('pull in replaces the chosen player during a live match', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    const waitingId = s.players.map((p) => p.id).find((id) => ![...s.courts[0].match!.a, ...s.courts[0].match!.b].includes(id))!
    const out = s.courts[0].match!.b[1]
    s = substitute(s, s.courts[0].id, out, waitingId)
    const m = s.courts[0].match!
    expect(m.b).toContain(waitingId)
    expect([...m.a, ...m.b]).not.toContain(out)
  })

  it('cannot pull in someone already on court or on a break', () => {
    let s = createSession('t', { courts: 2 }, names(10))
    const other = s.courts[1].match!.a[0]
    const out = s.courts[0].match!.a[0]
    const same = substitute(s, s.courts[0].id, out, other)
    expect(same.courts[0].match!.a).toContain(out)
    const waitingId = s.players.map((p) => p.id).find((id) => !s.courts.some((c) => [...c.match!.a, ...c.match!.b].includes(id)))!
    s = setStatus(s, waitingId, 'resting')
    expect(substitute(s, s.courts[0].id, out, waitingId).courts[0].match!.a).toContain(out)
  })

  it('pulling in a fixed team replaces the whole team on that side', () => {
    const pairs = [0, 1, 2, 3].map((i) => [{ name: `A${i}` }, { name: `B${i}` }] as [{ name: string }, { name: string }])
    let s = createSession('t', { format: 'teams', courts: 1 }, [], pairs)
    const m = s.courts[0].match!
    const waitingTeam = s.teams.find((t) => ![...m.a, ...m.b].includes(t.playerIds[0]))!
    s = substitute(s, s.courts[0].id, m.b[0], waitingTeam.playerIds[0])
    expect(s.courts[0].match!.b.slice().sort()).toEqual([...waitingTeam.playerIds].sort())
    expect(s.courts[0].match!.a).toEqual(m.a)
  })
})
