import { describe, expect, it } from 'vitest'
import * as S from './session'
import { busyIds, waitingUnits } from './queue'
import { playerStandings } from './stats'
import type { Config, Session } from './types'

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

function play(s: Session, r: () => number, n: number): Session {
  for (let i = 0; i < n; i++) {
    const live = s.courts.filter((c) => c.match)
    if (!live.length) break
    s = S.finishMatch(s, live[i % live.length].id, { winner: r() < 0.5 ? 'a' : 'b', scoreA: null, scoreB: null })
  }
  return s
}

describe('a friend who arrives in the middle of the game', () => {
  const cfgs: Partial<Config>[] = [{ mode: 'fair' }, { mode: 'winners' }, { mode: 'skill' }, { mode: 'robin' }, { mode: 'mystery' }, { format: 'singles' }]
  cfgs.forEach((cfg, ci) => {
    it(`${cfg.format ?? 'doubles'}/${cfg.mode ?? 'fair'}: joins the line, never lands on two courts, and soon plays as much as everyone`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const r = rng(seed * 17 + ci)
        let s = S.createSession('t', { courts: 2, ...cfg }, NAMES.slice(0, 9 + (seed % 4)).map((name) => ({ name })))
        s = play(s, r, 14)
        const before = s.matches.length
        s = S.addPlayer(s, 'Latecomer')
        const late = s.players.find((p) => p.name === 'Latecomer')!
        expect(late.status, `seed ${seed}`).toBe('active')
        // the games already on court are not disturbed
        expect(s.matches.length).toBe(before)
        const onCourt = [...busyIds(s)]
        expect(new Set(onCourt).size).toBe(onCourt.length)
        // they are in the waiting line, not silently dropped
        const inLine = waitingUnits(s).some((u) => u.ids.includes(late.id))
        expect(inLine || busyIds(s).has(late.id), `seed ${seed}: latecomer is neither waiting nor playing`).toBe(true)
        // keep playing: they must get games
        s = play(s, r, 40)
        const g = playerStandings(s).map((p) => p.played)
        const lateGames = playerStandings(s).find((p) => p.id === late.id)!.played
        expect(lateGames, `seed ${seed}: the latecomer never got a game`).toBeGreaterThan(0)
        expect(Math.max(...g) - lateGames, `seed ${seed}: the latecomer fell far behind (${lateGames} vs max ${Math.max(...g)})`).toBeLessThanOrEqual(Math.max(...g) - Math.min(...g) + 1)
      }
    })
  })

  it('several friends can arrive back to back, and the same name cannot be added twice', () => {
    const r = rng(5)
    let s = S.createSession('t', { courts: 2 }, NAMES.slice(0, 8).map((name) => ({ name })))
    s = play(s, r, 6)
    for (const n of ['Zed', 'Yan', 'Xia']) s = S.addPlayer(s, n)
    expect(s.players.length).toBe(11)
    const again = S.addPlayer(s, ' zed ')
    expect(again).toBe(s) // unchanged: that name is already in the session
    s = play(s, r, 30)
    for (const n of ['Zed', 'Yan', 'Xia']) expect(playerStandings(s).find((p) => p.name === n)!.played).toBeGreaterThan(0)
  })

  it('a late friend can be made to play next, and a late team joins Fixed teams', () => {
    const r = rng(9)
    let s = S.createSession('t', { courts: 1 }, NAMES.slice(0, 8).map((name) => ({ name })))
    s = play(s, r, 4)
    s = S.addPlayer(s, 'Late')
    const id = s.players.find((p) => p.name === 'Late')!.id
    s = S.playNext(s, id)
    expect(waitingUnits(s)[0].ids).toContain(id)

    let t = S.createSession('t', { courts: 1, format: 'teams' }, [], [[{ name: 'A1' }, { name: 'A2' }], [{ name: 'B1' }, { name: 'B2' }], [{ name: 'C1' }, { name: 'C2' }]])
    t = play(t, r, 6)
    t = S.addTeam(t, { name: 'D1' }, { name: 'D2' })
    expect(t.teams.length).toBe(4)
    t = play(t, r, 20)
    const d = playerStandings(t).find((p) => p.name === 'D1')!
    expect(d.played).toBeGreaterThan(0)
  })
})
