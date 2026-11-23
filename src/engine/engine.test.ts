import { describe, expect, it } from 'vitest'
import {
  addPlayer, cancelMatch, createSession, deleteMatch, editMatch, endSession, finishMatch, playNext, pullOut, remixCourt, remixNext, reopenSession, addTeam, addCourt, removeCourt, planCourtRemoval, swapOutOfNext, sendBack, setCourts, setStatus, substitute,
} from './session'
import { standings, playerStandings, summarize, countMatches, pairKey } from './stats'
import { validateScore } from './validate'
import { previewQueue, waitingUnits } from './queue'
import { awards } from './insights'
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

describe('remix', () => {
  const sig = (a: string[], b: string[]) => [[...a].sort().join('+'), [...b].sort().join('+')].sort().join('/')

  it('remixing the next matches gives a different match-up and leaves live games alone', () => {
    const s = createSession('t', { courts: 1 }, names(12))
    const live = JSON.stringify(s.courts[0].match)
    const before = previewQueue(s, 1)[0]
    const r = remixNext(s)
    const after = previewQueue(r, 1)[0]
    expect(sig(after.a, after.b!)).not.toBe(sig(before.a, before.b!))
    expect(JSON.stringify(r.courts[0].match)).toBe(live)
  })

  it('remix clears manual play-next overrides', () => {
    let s = createSession('t', { courts: 1 }, names(12))
    s = playNext(s, previewQueue(s, 2)[1].a[0])
    expect(s.players.some((p) => p.prio)).toBe(true)
    expect(remixNext(s).players.some((p) => p.prio)).toBe(false)
  })

  it('remix does not break fairness over a whole session', () => {
    let s = createSession('t', { courts: 2 }, names(11))
    for (let i = 0; i < 10; i++) {
      s = simulate(s, 1)
      if (i % 3 === 1) s = remixNext(s)
    }
    expect(spread(s)).toBeLessThanOrEqual(2)
  })

  it('remixing a live court redraws that game with a different line-up', () => {
    const s = createSession('t', { courts: 1 }, names(8))
    const old = s.courts[0].match!
    const r = remixCourt(s, s.courts[0].id)
    const m = r.courts[0].match!
    expect(sig(m.a, m.b)).not.toBe(sig(old.a, old.b))
    expect([...m.a, ...m.b]).toHaveLength(4)
  })

  it('remixing a court with only four players re-pairs them instead of swapping people in', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const old = s.courts[0].match!
    const m = remixCourt(s, s.courts[0].id).courts[0].match!
    expect([...m.a, ...m.b].sort()).toEqual([...old.a, ...old.b].sort())
    expect(sig(m.a, m.b)).not.toBe(sig(old.a, old.b))
  })

  it('returns the same session when no different match-up exists', () => {
    const s = createSession('t', { format: 'singles', courts: 1 }, names(2))
    expect(remixCourt(s, s.courts[0].id)).toBe(s)
    expect(remixNext(s)).toBe(s)
  })

  it('winners stay: remixing keeps the holders and redraws the challengers', () => {
    let s = createSession('t', { mode: 'winners', courts: 1, maxStreak: 5 }, names(10))
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 3 })
    const old = s.courts[0].match!
    const r = remixCourt(s, s.courts[0].id).courts[0].match!
    expect(r.a).toEqual(old.a)
    expect(r.b.slice().sort()).not.toEqual(old.b.slice().sort())
    expect(r.streak).toBe(old.streak)
  })

  it('fixed teams: remix swaps in different teams and keeps pairs intact', () => {
    const pairs = [0, 1, 2, 3, 4].map((i) => [{ name: `A${i}` }, { name: `B${i}` }] as [{ name: string }, { name: string }])
    const s = createSession('t', { format: 'teams', courts: 1 }, [], pairs)
    const old = s.courts[0].match!
    const m = remixCourt(s, s.courts[0].id).courts[0].match!
    expect(sig(m.a, m.b)).not.toBe(sig(old.a, old.b))
    for (const side of [m.a, m.b]) expect(s.teams.some((t) => pairKey(t.playerIds[0], t.playerIds[1]) === pairKey(side[0], side[1]))).toBe(true)
  })
})

describe('breaks keep earned priority', () => {
  it('a short break does not reset wait time or add games', () => {
    let s = createSession('t', { courts: 1 }, names(9))
    s = simulate(s, 2)
    const onCourt = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    const id = s.players.find((p) => !onCourt.includes(p.id))!.id
    const before = s.players.find((p) => p.id === id)!
    const snap = { base: before.baseGames, last: before.lastPlayed }
    s = setStatus(s, id, 'resting')
    s = simulate(s, 1)
    s = setStatus(s, id, 'active')
    const after = s.players.find((p) => p.id === id)!
    expect(after.lastPlayed).toBe(snap.last)
    expect(after.baseGames).toBe(snap.base)
  })

  it('a long absence gets a capped catch-up so they cannot take every court', () => {
    let s = createSession('t', { courts: 1 }, names(9))
    s = setStatus(s, s.players[8].id, 'resting')
    s = simulate(s, 10)
    s = setStatus(s, s.players[8].id, 'active')
    const p = s.players[8]
    expect(p.baseGames).toBeGreaterThan(0)
    s = simulate(s, 3)
    expect(standings(s).find((x) => x.id === p.id)!.played).toBeLessThanOrEqual(3)
  })

  it('a player who waited the longest comes back at the front', () => {
    let s = createSession('t', { courts: 1 }, names(10))
    const onCourt = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    const id = s.players.find((p) => !onCourt.includes(p.id))!.id
    s = setStatus(s, id, 'resting')
    s = setStatus(s, id, 'active')
    const first = previewQueue(s, 1)[0]
    expect([...first.a, ...first.b!]).toContain(id)
  })
})

describe('one-tap swap out of the next match', () => {
  it('sends the player to the back and the next in line steps up', () => {
    let s = createSession('t', { courts: 1 }, names(10))
    const next = previewQueue(s, 1)[0]
    const id = next.a[0]
    s = swapOutOfNext(s, id)
    const after = previewQueue(s, 1)[0]
    expect([...after.a, ...after.b!]).not.toContain(id)
    expect([...after.a, ...after.b!]).toHaveLength(4)
  })

  it('does nothing when there is nobody extra to bring in', () => {
    const s = createSession('t', { courts: 1 }, names(8))
    const next = previewQueue(s, 1)[0]
    expect(swapOutOfNext(s, next.a[0])).toBe(s)
  })
})

describe('reopening an ended session', () => {
  it('restores play and keeps the match history', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    s = simulate(s, 3)
    s = endSession(s)
    s = reopenSession(s)
    expect(s.endedAt).toBeNull()
    expect(s.matches).toHaveLength(3)
    expect(s.courts[0].match).not.toBeNull()
  })
})

describe('send to back is temporary', () => {
  it('a player sent to the back still gets games (no starvation)', () => {
    let s = createSession('t', { courts: 2 }, names(14))
    const victim = previewQueue(s, 1)[0].a[0]
    s = swapOutOfNext(s, victim)
    s = simulate(s, 20)
    expect(spread(s)).toBeLessThanOrEqual(2)
    expect(standings(s).find((p) => p.id === victim)!.played).toBeGreaterThan(0)
  })

  it('repeated swaps of the same slot cannot starve anyone', () => {
    let s = createSession('t', { courts: 2 }, names(14))
    for (let i = 0; i < 12; i++) {
      const next = previewQueue(s, 1)[0]
      if (next) s = swapOutOfNext(s, next.a[0])
      s = simulate(s, 1)
    }
    s = simulate(s, 14)
    expect(Math.min(...standings(s).map((p) => p.played))).toBeGreaterThan(0)
  })
})

describe('time on court', () => {
  it('records how long each game lasted and totals it per player', () => {
    let s = createSession('t', { courts: 1 }, names(4))
    s.courts[0].match!.startedAt = Date.now() - 12 * 60000
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    expect(s.matches[0].ms).toBeGreaterThanOrEqual(12 * 60000)
    expect(s.matches[0].ms).toBeLessThan(12 * 60000 + 5000)
    for (const p of standings(s)) expect(Math.round(p.playMs / 60000)).toBe(12)
  })

  it('adds up across games and ignores games with no recorded duration', () => {
    let s = createSession('t', { courts: 1 }, names(4))
    s.courts[0].match!.startedAt = Date.now() - 10 * 60000
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    s.courts[0].match!.startedAt = Date.now() - 5 * 60000
    s = finishMatch(s, s.courts[0].id, { winner: 'b', scoreA: 4, scoreB: 11 })
    delete s.matches[0].ms // a game saved by an older version
    for (const p of standings(s)) expect(Math.round(p.playMs / 60000)).toBe(5)
  })
})

describe('fixing mistakes in match history', () => {
  const win = (s: Session, side: 'a' | 'b' = 'a') => finishMatch(s, s.courts[0].id, { winner: side, scoreA: side === 'a' ? 11 : 4, scoreB: side === 'a' ? 4 : 11 })

  it('flipping a misclicked winner moves the win and loss in standings', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    s = win(s, 'a')
    const m = s.matches[0]
    s = editMatch(s, m.id, { winner: 'b', scoreA: 4, scoreB: 11 })
    const st = standings(s)
    for (const id of m.b) expect(st.find((p) => p.id === id)!.wins).toBe(1)
    for (const id of m.a) expect(st.find((p) => p.id === id)!.losses).toBe(1)
  })

  it('a game that did not go through gives those players their place back in the queue (games and wait time)', () => {
    let s = createSession('t', { mode: 'winners', courts: 1, maxStreak: 1 }, names(10))
    const first = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    s = win(s, 'a')
    s = win(s, 'a')
    const lastBefore = Object.fromEntries(s.players.map((p) => [p.id, p.lastPlayed]))
    s = deleteMatch(s, s.matches[0].id)
    for (const id of first) {
      const p = s.players.find((x) => x.id === id)!
      expect(p.lastPlayed).toBeLessThanOrEqual(lastBefore[id])
    }
    expect(s.matches).toHaveLength(1)
    expect(standings(s).reduce((n, p) => n + p.played, 0)).toBe(4)
  })

  it('deleting the only game a player had resets them to their join time, not "just played"', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    const ids = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    s = win(s)
    expect(s.players.find((p) => p.id === ids[0])!.lastPlayed).toBe(1)
    s = deleteMatch(s, s.matches[0].id)
    for (const id of ids) expect(s.players.find((p) => p.id === id)!.lastPlayed).toBe(0)
  })

  it('deleting an older game leaves later players\' wait times alone', () => {
    let s = createSession('t', { courts: 1 }, names(4))
    s = win(s)
    s = win(s)
    const before = s.players.map((p) => p.lastPlayed)
    s = deleteMatch(s, s.matches[0].id)
    expect(s.players.map((p) => p.lastPlayed)).toEqual(before)
  })

  it('edit keeps the recorded game length and who played', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    s.courts[0].match!.startedAt = Date.now() - 9 * 60000
    s = win(s)
    const before = { ms: s.matches[0].ms, a: s.matches[0].a, b: s.matches[0].b }
    s = editMatch(s, s.matches[0].id, { winner: null, scoreA: null, scoreB: null })
    expect(s.matches[0].ms).toBe(before.ms)
    expect(s.matches[0].a).toEqual(before.a)
    expect(s.matches[0].winner).toBeNull()
  })

  it('deleting every game returns standings to zero and play continues', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    s = win(s)
    s = win(s)
    for (const m of [...s.matches]) s = deleteMatch(s, m.id)
    expect(s.matches).toHaveLength(0)
    expect(standings(s).every((p) => p.played === 0)).toBe(true)
    expect(s.courts[0].match).not.toBeNull()
  })
})


describe('removing a court mid-session', () => {
  const ids = (c: { match: { a: string[]; b: string[] } | null }) => (c.match ? [...c.match.a, ...c.match.b] : [])

  it('can remove a court while a game is on it', () => {
    let s = createSession('t', { courts: 2 }, names(12))
    const doomed = s.courts[1].id
    s = removeCourt(s, doomed)
    expect(s.courts).toHaveLength(1)
    expect(s.config.courts).toBe(1)
    expect(s.courts.some((c) => c.id === doomed)).toBe(false)
  })

  it('one court is always required', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    expect(planCourtRemoval(s, s.courts[0].id)).toBeNull()
    expect(removeCourt(s, s.courts[0].id)).toBe(s)
    s = setCourts(s, 0)
    expect(s.courts).toHaveLength(1)
    let two = createSession('t', { courts: 2 }, names(12))
    two = setCourts(two, -5)
    expect(two.courts).toHaveLength(1)
  })

  it('a live game moves to a free court instead of being lost', () => {
    // 4 players, 2 courts: Court 1 plays, Court 2 is free (nobody to fill it).
    let s = createSession('t', { courts: 2 }, names(4))
    const live = s.courts.find((c) => c.match)!
    const free = s.courts.find((c) => !c.match)!
    const players = ids(live).sort()
    expect(planCourtRemoval(s, live.id)).toMatchObject({ kind: 'moved', players: 4, to: free.name })
    s = removeCourt(s, live.id)
    expect(s.courts).toHaveLength(1)
    expect(ids(s.courts[0]).sort()).toEqual(players)
    expect(s.matches).toHaveLength(0) // not recorded: it is still being played
  })

  it('with no free court, the game is not recorded and its players go to the front of the line', () => {
    let s = createSession('t', { courts: 2 }, names(12))
    const doomed = s.courts[1]
    const cut = ids(doomed)
    expect(planCourtRemoval(s, doomed.id)).toMatchObject({ kind: 'queued', players: 4 })
    s = removeCourt(s, doomed.id)
    expect(s.matches).toHaveLength(0)
    const next = previewQueue(s, 1)[0]
    expect([...next.a, ...next.b!].sort()).toEqual([...cut].sort())
  })

  it('removing an idle court changes nothing for players', () => {
    let s = createSession('t', { courts: 3 }, names(8))
    const idle = s.courts.find((c) => !c.match)!
    expect(planCourtRemoval(s, idle.id)).toMatchObject({ kind: 'idle' })
    const before = s.courts.filter((c) => c.match).map((c) => ids(c).join())
    s = removeCourt(s, idle.id)
    expect(s.courts).toHaveLength(2)
    expect(s.courts.filter((c) => c.match).map((c) => ids(c).join())).toEqual(before)
  })

  it('can remove any court, not just the last one, and play carries on', () => {
    let s = createSession('t', { courts: 3 }, names(14))
    const middle = s.courts[1].id
    s = removeCourt(s, middle)
    expect(s.courts.map((c) => c.name)).toEqual(['Court 1', 'Court 3'])
    s = simulate(s, 6)
    expect(s.matches.length).toBeGreaterThan(0)
    expect(spread(s)).toBeLessThanOrEqual(2)
  })

  it('new courts never reuse a name that is still in use', () => {
    let s = createSession('t', { courts: 3 }, names(14))
    s = removeCourt(s, s.courts[1].id) // Court 1, Court 3
    s = addCourt(s)
    const n = s.courts.map((c) => c.name)
    expect(new Set(n).size).toBe(n.length)
    expect(n).toEqual(['Court 1', 'Court 3', 'Court 2'])
  })

  it('never puts a player on two courts after removing and re-adding', () => {
    let s = createSession('t', { courts: 3 }, names(14))
    s = removeCourt(s, s.courts[0].id)
    s = addCourt(s)
    s = removeCourt(s, s.courts[1].id)
    const all = s.courts.flatMap(ids)
    expect(new Set(all).size).toBe(all.length)
  })

  it('removing a challenger court keeps the other courts rotating', () => {
    let s = createSession('t', { courts: 2, challengerCourt: true, maxStreak: 4 }, names(12))
    s = removeCourt(s, s.courts[0].id)
    expect(s.courts).toHaveLength(1)
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 3 })
    expect(s.courts[0].match!.streak).toBe(0)
  })

  it('setCourts still adds and removes in bulk', () => {
    let s = createSession('t', { courts: 2 }, names(14))
    s = setCourts(s, 5)
    expect(s.courts).toHaveLength(5)
    s = setCourts(s, 2)
    expect(s.courts).toHaveLength(2)
    expect(s.config.courts).toBe(2)
  })
})

describe('Fixed teams standings rank teams, not individual players', () => {
  type P = { name: string }
  const teamNames: [string, string][] = [['Josh', 'Daria'], ['Stee', 'Kp'], ['Julius', 'Dar'], ['Ann', 'Bo']]
  const mk = () => createSession('t', { format: 'teams', courts: 1, maxStreak: 9 }, [], teamNames.map(([x, y]) => [{ name: x }, { name: y }] as [P, P]))
  const teamIds = (s: Session, a: string) => s.teams.find((x) => x.name.startsWith(a))!.playerIds as string[]

  /** Write finished games directly, so each test controls exactly who beat whom. */
  const record = (s: Session, results: [string, string][]) => {
    s.matches = results.map(([w, l], i) => ({
      id: 'g' + i, seq: i + 1, court: 'Court 1', a: teamIds(s, w), b: teamIds(s, l),
      scoreA: 11, scoreB: 5, winner: 'a' as const, at: i, ms: 600_000,
    }))
    s.seq = results.length
    return s
  }

  it('shows one row per team, named with both partners', () => {
    const rows = standings(mk())
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.name).sort()).toEqual(['Ann & Bo', 'Josh & Daria', 'Julius & Dar', 'Stee & Kp'])
  })

  it('ranks teams 1st, 2nd, 3rd with their partner (the reported scenario)', () => {
    const s = record(mk(), [
      ['Josh', 'Stee'], ['Josh', 'Julius'], ['Josh', 'Ann'],
      ['Stee', 'Julius'], ['Stee', 'Ann'],
      ['Julius', 'Ann'],
    ])
    const rows = standings(s)
    expect(rows.slice(0, 3).map((r) => r.name)).toEqual(['Josh & Daria', 'Stee & Kp', 'Julius & Dar'])
    expect(rows[3].name).toBe('Ann & Bo')
  })

  it('a team record is counted once, not once per partner', () => {
    const s = record(mk(), [['Josh', 'Stee']])
    const team = standings(s).find((r) => r.name === 'Josh & Daria')!
    expect(team.wins).toBe(1)
    expect(team.played).toBe(1)
    const partners = playerStandings(s).filter((p) => ['Josh', 'Daria'].includes(p.name))
    expect(partners.every((p) => p.wins === 1 && p.played === 1)).toBe(true)
    expect(standings(s).reduce((n, r) => n + r.played, 0)).toBe(2) // one game = two teams, not four players
  })

  it('carries the team minutes and point difference', () => {
    const s = record(mk(), [['Josh', 'Stee']])
    const team = standings(s).find((r) => r.name === 'Josh & Daria')!
    expect(team.playMs).toBe(600_000)
    expect(team.diff).toBe(6)
  })

  it('doubles and singles still rank individual players', () => {
    const d = createSession('t', { courts: 1 }, names(5))
    expect(standings(d)).toHaveLength(5)
    const one = createSession('t', { format: 'singles', courts: 1 }, names(3))
    expect(standings(one)).toHaveLength(3)
    expect(standings(one).some((r) => r.name.includes(' & '))).toBe(false)
  })

  it('a team added mid-session appears as its own row', () => {
    let s = mk()
    s = addTeam(s, { name: 'Late1' }, { name: 'Late2' })
    expect(standings(s).map((r) => r.name)).toContain('Late1 & Late2')
    expect(standings(s)).toHaveLength(5)
  })

  it('awards name teams, never "?" and never split a team into two winners', () => {
    let s = mk()
    for (let i = 0; i < 6; i++) s = finishMatch(s, s.courts[0].id, { winner: i % 2 ? 'a' : 'b', scoreA: i % 2 ? 11 : 9, scoreB: i % 2 ? 9 : 11 })
    const list = awards(s)
    expect(list.length).toBeGreaterThan(0)
    for (const a of list) {
      expect(a.winner).not.toContain('?')
      expect(a.title).not.toBe('Social Butterfly') // partners never change in Fixed teams
      expect(a.title).not.toBe('Dynamic Duo')
    }
    const iron = list.find((a) => a.id === 'iron')
    if (iron) expect(iron.winner).toMatch(/ & /)
  })

  it('has no "best duo" in Fixed teams (it would just repeat the top team)', () => {
    const s = record(mk(), [['Josh', 'Stee'], ['Josh', 'Stee'], ['Josh', 'Stee']])
    expect(summarize(s).bestDuo).toBeNull()
  })

  it('teams with no games sit below teams that have played', () => {
    const s = record(mk(), [['Josh', 'Stee']])
    const rows = standings(s)
    expect(rows[0].name).toBe('Josh & Daria')
    expect(rows[1].name).toBe('Stee & Kp') // lost, but played: ranks above the two teams that did not play
  })
})

describe('a stale tap cannot score the wrong game', () => {
  it('a second tap meant for the finished game is ignored', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    const first = s.courts[0].match!.gid
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: null, scoreB: null, expect: first })
    expect(s.matches).toHaveLength(1)
    const next = s.courts[0].match!
    const again = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: null, scoreB: null, expect: first })
    expect(again).toBe(s) // same object: nothing changed, and Undo is not polluted
    expect(again.matches).toHaveLength(1)
    expect(again.courts[0].match).toBe(next)
  })

  it('the first tap works, and so does a tap with no expectation (the score sheet)', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    s = finishMatch(s, s.courts[0].id, { winner: 'b', scoreA: null, scoreB: null, expect: s.courts[0].match!.gid })
    expect(s.matches).toHaveLength(1)
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    expect(s.matches).toHaveLength(2)
  })

  it('ten taps on one game record exactly one result', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    const stamp = s.courts[0].match!.gid
    for (let i = 0; i < 10; i++) s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: null, scoreB: null, expect: stamp })
    expect(s.matches).toHaveLength(1)
  })

  it('games saved by older versions (no game number) still work', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    delete s.courts[0].match!.gid
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: null, scoreB: null, expect: 12345 })
    expect(s.matches).toHaveLength(1)
  })

  it('every game gets its own number, even within the same millisecond', () => {
    let s = createSession('t', { courts: 2 }, names(16))
    const seen = new Set<number>()
    for (let i = 0; i < 30; i++) {
      for (const c of s.courts) if (c.match) { expect(c.match.gid).toBeDefined(); if (!seen.has(c.match.gid!)) seen.add(c.match.gid!) }
      const c = s.courts.find((x) => x.match)!
      s = finishMatch(s, c.id, { winner: 'a', scoreA: null, scoreB: null })
    }
    const live = s.courts.filter((c) => c.match).map((c) => c.match!.gid)
    expect(new Set(live).size).toBe(live.length)
    expect(seen.size).toBeGreaterThan(20)
  })

  it('a tap for a court that no longer exists or has no game does nothing', () => {
    const s = createSession('t', { courts: 1 }, names(3)) // not enough players: nothing on court
    expect(finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: null, scoreB: null, expect: 1 })).toBe(s)
    expect(finishMatch(s, 'nope', { winner: 'a', scoreA: null, scoreB: null })).toBe(s)
  })
})

describe('winners stay & split', () => {
  const cfg = { mode: 'winners' as const, courts: 1, maxStreak: 3, winnersSplit: true }
  const win = (s: Session, side: 'a' | 'b') => finishMatch(s, s.courts[0].id, { winner: side, scoreA: null, scoreB: null })

  it('the winners separate and each partners a newcomer', () => {
    let s = createSession('t', cfg, names(10))
    const m = s.courts[0].match!
    const winners = [...m.a]
    s = win(s, 'a')
    const next = s.courts[0].match!
    expect(next.a.includes(winners[0]) && next.a.includes(winners[1])).toBe(false) // not together
    expect(next.b.includes(winners[0]) && next.b.includes(winners[1])).toBe(false)
    expect([...next.a, ...next.b]).toEqual(expect.arrayContaining(winners)) // both still on court
    const onA = winners.filter((w) => next.a.includes(w)).length
    expect(onA).toBe(1) // exactly one winner per side
    const newcomers = [...next.a, ...next.b].filter((id) => !winners.includes(id))
    expect(newcomers).toHaveLength(2)
    expect(newcomers.some((id) => m.b.includes(id))).toBe(false) // the losers went to the back
  })

  it('"together" is still the default when split is off', () => {
    let s = createSession('t', { ...cfg, winnersSplit: false }, names(10))
    const winners = [...s.courts[0].match!.a]
    s = win(s, 'a')
    const next = s.courts[0].match!
    expect(next.a).toEqual(winners)
  })

  it('never splits singles or fixed teams (there is no partner to split)', () => {
    let one = createSession('t', { ...cfg, format: 'singles' }, names(6))
    const w = one.courts[0].match!.a[0]
    one = win(one, 'a')
    expect(one.courts[0].match!.a).toEqual([w])
    const pairs: [{ name: string }, { name: string }][] = [0, 1, 2, 3].map((i) => [{ name: `A${i}` }, { name: `B${i}` }])
    let teams = createSession('t', { ...cfg, format: 'teams' }, [], pairs)
    const wt = [...teams.courts[0].match!.a]
    teams = win(teams, 'a')
    expect(teams.courts[0].match!.a).toEqual(wt)
  })

  it('the streak cap sends the winners off after the configured number of wins', () => {
    let s = createSession('t', { ...cfg, maxStreak: 2 }, names(12))
    const [w1, w2] = [...s.courts[0].match!.a]
    s = win(s, 'a') // 1st win for w1 and w2
    // after the split they are on opposite sides; whichever side wins carries one of them (2nd win)
    const sideOf = (id: string) => (s.courts[0].match!.a.includes(id) ? 'a' : 'b')
    expect(sideOf(w1)).not.toBe(sideOf(w2))
    s = win(s, sideOf(w1))
    const after = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    expect(s.matches).toHaveLength(2)
    // w1 won a 2nd time (cap reached) and left the court, so they must not be playing a 3rd game in a row
    expect(after.includes(w1)).toBe(false)
  })

  it('a winner who loses loses their streak, a winner who wins keeps counting', () => {
    let s = createSession('t', { ...cfg, maxStreak: 5 }, names(12))
    const [w1, w2] = [...s.courts[0].match!.a]
    s = win(s, 'a')
    const sideOf = (id: string) => (s.courts[0].match!.a.includes(id) ? 'a' : 'b')
    const winnerSide = sideOf(w1)
    s = win(s, winnerSide)
    expect(s.matches[1].streak).toBe(2) // w1 extends to 2
    expect(typeof w2).toBe('string')
  })

  it('games stay fair, nobody is starved by the split', () => {
    let s = createSession('t', { ...cfg, maxStreak: 2, courts: 2 }, names(11))
    for (let i = 0; i < 70; i++) {
      const live = s.courts.filter((c) => c.match)
      if (!live.length) break
      const c = live[i % live.length]
      s = finishMatch(s, c.id, { winner: i % 3 ? 'a' : 'b', scoreA: null, scoreB: null })
    }
    const g = playerStandings(s).map((p) => p.played)
    expect(Math.max(...g) - Math.min(...g)).toBeLessThanOrEqual(5)
  })

  it('a split works even with only five players, because the losers rejoin the line', () => {
    let s = createSession('t', { ...cfg }, names(5)) // 4 on court, 1 waiting
    const winners = [...s.courts[0].match!.a]
    s = win(s, 'a')
    const next = s.courts[0].match!
    expect(next).not.toBeNull()
    const all = [...next.a, ...next.b]
    expect(new Set(all).size).toBe(4) // four different people, nobody twice
    expect(winners.every((w) => all.includes(w))).toBe(true) // both winners are still on court
    expect(winners.filter((w) => next.a.includes(w))).toHaveLength(1) // one on each side
  })
})

describe('break return rule', () => {
  it('"keep" (the default): a returning player is back at their earned place', () => {
    let s = createSession('t', { courts: 1 }, names(10))
    const onCourt = new Set([...s.courts[0].match!.a, ...s.courts[0].match!.b])
    const id = s.players.find((p) => !onCourt.has(p.id))!.id
    s = setStatus(s, id, 'resting')
    s = setStatus(s, id, 'active')
    const first = previewQueue(s, 1)[0]
    expect([...first.a, ...first.b!]).toContain(id) // they had waited longest, so they are up next
  })

  it('"back": a returning player rejoins behind everyone already waiting', () => {
    let s = createSession('t', { courts: 1, breakReturn: 'back' }, names(10))
    const onCourt = new Set([...s.courts[0].match!.a, ...s.courts[0].match!.b])
    const id = s.players.find((p) => !onCourt.has(p.id))!.id
    s = setStatus(s, id, 'resting')
    s = setStatus(s, id, 'active')
    const first = previewQueue(s, 1)[0]
    expect([...first.a, ...first.b!]).not.toContain(id)
  })

  it('"back" is only a one-time skip: the player still gets games afterwards', () => {
    let s = createSession('t', { courts: 1, breakReturn: 'back' }, names(10))
    const onCourt = new Set([...s.courts[0].match!.a, ...s.courts[0].match!.b])
    const id = s.players.find((p) => !onCourt.has(p.id))!.id
    s = setStatus(s, id, 'resting')
    s = setStatus(s, id, 'active')
    s = simulate(s, 16)
    expect(playerStandings(s).find((p) => p.id === id)!.played).toBeGreaterThan(0)
    expect(spread(s)).toBeLessThanOrEqual(2)
  })
})

describe('matching quality guarantees', () => {
  it('singles spread head-to-head meetings evenly (5 players meet each other equally)', () => {
    let s = createSession('t', { courts: 1, format: 'singles' }, names(5))
    s = simulate(s, 30)
    const { opp } = countMatches(s.matches)
    const v = [...opp.values()]
    expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(1)
    expect(v).toHaveLength(10)
  })

  it('mystery mix never repeats the exact previous match-up when other line-ups exist', () => {
    for (const n of [5, 6, 8, 10]) {
      let s = createSession('t', { courts: 1, mode: 'mystery' }, names(n))
      let prev = ''
      for (let i = 0; i < 30; i++) {
        const m = s.courts[0].match!
        const sig = [[...m.a].sort().join('+'), [...m.b].sort().join('+')].sort().join('/')
        expect(sig, `${n} players, game ${i + 1}`).not.toBe(prev)
        prev = sig
        s = finishMatch(s, s.courts[0].id, { winner: i % 2 ? 'a' : 'b', scoreA: null, scoreB: null })
      }
    }
  })

  it('strongest + weakest vs the middle two is always the closest team split', () => {
    const vals = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]
    for (const a of vals) for (const b of vals) for (const c of vals) for (const d of vals) {
      const r = [a, b, c, d].sort((x, y) => x - y)
      const gap = (i: number[]) => Math.abs(r[i[0]] + r[i[1]] - r[i[2]] - r[i[3]])
      expect(gap([0, 3, 1, 2])).toBeLessThanOrEqual(Math.min(gap([0, 1, 2, 3]), gap([0, 2, 1, 3])) + 1e-9)
    }
  })

  it('skill teams are balanced in a real game', () => {
    const s = createSession('t', { mode: 'skill', courts: 1 }, [5, 5, 2, 2].map((level, i) => ({ name: `S${i}`, level })))
    const m = s.courts[0].match!
    const sum = (ids: string[]) => ids.reduce((n, id) => n + s.players.find((p) => p.id === id)!.level, 0)
    expect(sum(m.a)).toBe(sum(m.b))
  })
})

describe('the "on deck" match is a promise', () => {
  const people = (a: string[], b: string[]) => [...a, ...b].sort().join('+')

  /** Play out a session; before every finish, remember what was promised, then check what actually started. */
  function audit(cfg: Partial<Config>, n: number, games = 80) {
    let s = createSession('t', { courts: 2, ...cfg }, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, level: 2 + (i % 7) * 0.5 })))
    let checked = 0
    const wrong: string[] = []
    let jumps = 0
    for (let i = 0; i < games; i++) {
      const live = s.courts.filter((c) => c.match)
      if (!live.length) break
      const c = live[i % live.length]
      const finishing = new Set([...c.match!.a, ...c.match!.b])
      const waiting = s.players.filter((p) => !s.courts.some((x) => x.match && [...x.match.a, ...x.match.b].includes(p.id))).length
      const promised = previewQueue(s, 1)[0]
      s = finishMatch(s, c.id, { winner: i % 2 ? 'a' : 'b', scoreA: null, scoreB: null })
      const started = s.courts.find((x) => x.id === c.id)!.match
      if (!promised?.b || !started) continue
      checked++
      if (people(promised.a, promised.b) !== people(started.a, started.b)) wrong.push(`game ${i + 1}`)
      if (waiting >= 4 && [...started.a, ...started.b].some((id) => finishing.has(id))) jumps++
    }
    return { checked, wrong, jumps }
  }

  it.each([
    ['fair', { mode: 'fair' as const }, 12],
    ['fair', { mode: 'fair' as const }, 13],
    ['fair', { mode: 'fair' as const }, 14],
    ['fair', { mode: 'fair' as const }, 16],
    ['skill', { mode: 'skill' as const }, 12],
    ['robin', { mode: 'robin' as const }, 12],
    ['singles', { format: 'singles' as const }, 8],
    ['singles', { format: 'singles' as const }, 9],
  ])('%s with %i players: what is shown on deck is exactly what starts', (_label, cfg, n) => {
    const r = audit(cfg, n)
    expect(r.checked).toBeGreaterThan(30)
    expect(r.wrong).toEqual([])
  })

  it('a player who has just come off court never jumps someone who was already waiting', () => {
    for (const n of [12, 13, 14]) expect(audit({ mode: 'fair' }, n).jumps, `${n} players`).toBe(0)
    expect(audit({ mode: 'skill' }, 12).jumps).toBe(0)
  })

  it('the line order does not reshuffle just because a game finished', () => {
    let s = createSession('t', { courts: 2 }, Array.from({ length: 14 }, (_, i) => ({ name: `P${i + 1}` })))
    const order = (x: Session) => waitingUnits(x).map((u) => u.ids[0])
    const before = order(s)
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: null, scoreB: null })
    const after = order(s)
    // everyone who was waiting keeps the same relative order
    const kept = before.filter((id) => after.includes(id))
    expect(after.filter((id) => kept.includes(id))).toEqual(kept)
  })

  it('the promise survives the host checking the board many times (it is not re-drawn on every look)', () => {
    const s = createSession('t', { courts: 2 }, Array.from({ length: 13 }, (_, i) => ({ name: `P${i + 1}` })))
    const first = JSON.stringify(previewQueue(s, 3))
    for (let i = 0; i < 20; i++) expect(JSON.stringify(previewQueue(s, 3))).toBe(first)
  })

  it('a remix still changes the next match (the promise is only kept until the host asks otherwise)', () => {
    const s = createSession('t', { courts: 1 }, Array.from({ length: 12 }, (_, i) => ({ name: `P${i + 1}` })))
    const before = previewQueue(s, 1)[0]
    const after = previewQueue(remixNext(s), 1)[0]
    expect(people(after.a, after.b!)).not.toBe(people(before.a, before.b!))
  })

  it('Mystery mix is a surprise by design: it does not claim to be a promise', () => {
    const r = audit({ mode: 'mystery' }, 12)
    expect(r.checked).toBeGreaterThan(30) // it still starts games every time, just not the previewed ones
  })
})
