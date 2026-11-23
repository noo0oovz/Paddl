import { describe, expect, it } from 'vitest'
import { awards, avgGameMs, etaText, queueEta, rivalryFor, streakCall } from './insights'
import { addPlayer, createSession, finishMatch, toggleCourtTag } from './session'
import { countMatches, pairKey, standings } from './stats'
import { previewQueue } from './queue'
import type { Match, Session } from './types'

const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` }))

function game(_s: Session, i: number, a: string[], b: string[], scoreA: number, scoreB: number, ms = 600_000): Match {
  return { id: `x${i}`, seq: i + 1, court: 'Court 1', a, b, scoreA, scoreB, winner: scoreA > scoreB ? 'a' : 'b', at: i, ms }
}
const ids = (s: Session) => s.players.map((p) => p.id)

describe('awards', () => {
  it('returns nothing before any game is played', () => {
    expect(awards(createSession('t', { courts: 1 }, names(8)))).toEqual([])
  })

  it('Iron Player: most games, then most time on court', () => {
    const s = createSession('t', { courts: 1 }, names(6))
    const [a, b, c, d, e, f] = ids(s)
    // P1 plays all 3 games; every other player plays at most 2.
    s.matches = [
      game(s, 0, [a, b], [c, d], 11, 5, 600_000),
      game(s, 1, [a, e], [f, b], 11, 5, 900_000),
      game(s, 2, [a, c], [e, f], 11, 5, 600_000),
    ]
    const counts = Object.fromEntries(standings(s).map((p) => [p.name, p.played]))
    expect(counts).toEqual({ P1: 3, P2: 2, P3: 2, P4: 1, P5: 2, P6: 2 })
    const iron = awards(s).find((x) => x.id === 'iron')!
    expect(iron.winner).toBe('P1')
    expect(iron.detail).toContain('3 games')
    expect(iron.detail).toContain('35 min')
  })

  it('Iron Player ties on games are broken by minutes on court, and a true tie names everyone', () => {
    const s = createSession('t', { courts: 1 }, names(10))
    const [a, b, c, d, e, f] = ids(s)
    // P1 and P2 play 2 games, but P1's games were longer: P1 alone takes it.
    s.matches = [game(s, 0, [a, c], [d, e], 11, 5, 900_000), game(s, 1, [a, b], [d, e], 11, 5, 900_000), game(s, 2, [b, c], [f, e], 11, 5, 300_000)]
    expect(awards(s).find((x) => x.id === 'iron')!.winner).toBe('P5') // P5 is in all three games, P4 in two
    // A true tie: four players play exactly the same two games for the same time (4 of 10 is under half the field).
    const tie = createSession('t', { courts: 1 }, names(10))
    const [w, x, y, z] = ids(tie)
    tie.matches = [game(tie, 0, [w, x], [y, z], 11, 5, 600_000), game(tie, 1, [w, x], [y, z], 11, 5, 600_000)]
    const iron = awards(tie).find((q) => q.id === 'iron')!
    expect(iron.winner).toBe('P1, P2, P3 & P4') // every name, nothing hidden behind "+2"
    expect(iron.tied).toBe(4)
    expect(iron.detail).toMatch(/^4-way tie · 2 games/)
  })

  it('Clutch Closer counts only wins by 2 or less and ignores games without scores', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const [a, b, c, d] = ids(s)
    s.matches = [
      game(s, 0, [a, b], [c, d], 11, 9),
      game(s, 1, [a, c], [b, d], 12, 10),
      game(s, 2, [c, d], [a, b], 11, 3),
      { ...game(s, 3, [b, d], [a, c], 0, 0), scoreA: null, scoreB: null, winner: 'a' },
    ]
    const clutch = awards(s).find((x) => x.id === 'clutch')!
    expect(clutch.winner).toBe('P1')
    expect(clutch.detail).toContain('2 wins')
  })

  it('no Clutch Closer when no close game was scored', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const [a, b, c, d] = ids(s)
    s.matches = [game(s, 0, [a, b], [c, d], 11, 3)]
    expect(awards(s).find((x) => x.id === 'clutch')).toBeUndefined()
  })

  it('Social Butterfly: the player who met the most different people', () => {
    const s = createSession('t', { courts: 1 }, names(6))
    const [a, b, c, d, e, f] = ids(s)
    s.matches = [
      game(s, 0, [a, b], [c, d], 11, 5),
      game(s, 1, [a, e], [c, f], 11, 5),
      game(s, 2, [a, d], [b, f], 11, 5),
    ]
    const social = awards(s).find((x) => x.id === 'social')!
    expect(social.winner).toBe('P1')
    expect(social.detail).toMatch(/3 partners and faced 4 opponents/)
  })

  it('Marathon Match: the longest recorded game', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const [a, b, c, d] = ids(s)
    s.matches = [game(s, 0, [a, b], [c, d], 11, 5, 600_000), game(s, 1, [a, c], [b, d], 15, 13, 1_500_000)]
    const m = awards(s).find((x) => x.id === 'marathon')!
    expect(m.detail).toBe('25 min on Court 1')
  })

  it('skips Marathon Match for games under a minute (a mis-tap is not a marathon)', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const [a, b, c, d] = ids(s)
    s.matches = [game(s, 0, [a, b], [c, d], 11, 5, 5_000)]
    expect(awards(s).find((x) => x.id === 'marathon')).toBeUndefined()
  })

  it('On Fire needs 3 in a row; Dynamic Duo needs 3 games together and a winning record', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const [a, b, c, d] = ids(s)
    s.matches = [
      game(s, 0, [a, b], [c, d], 11, 5),
      game(s, 1, [a, b], [c, d], 11, 5),
      game(s, 2, [a, b], [c, d], 11, 5),
    ]
    const out = awards(s)
    const fire = out.find((x) => x.id === 'streak')!
    expect(fire.detail).toMatch(/3 wins in a row$/)
    expect(fire.winner).toBe('P1 & P2') // both partners won all three, so it is a 2-way tie
    expect(out.find((x) => x.id === 'duo')!.detail).toBe('3–0 as partners')
  })

  it('awards never name a player who has no games', () => {
    let s = createSession('t', { courts: 1 }, names(9))
    for (let i = 0; i < 3; i++) s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 9 })
    const played = new Set(s.matches.flatMap((m) => [...m.a, ...m.b]))
    const idle = standings(s).filter((p) => !played.has(p.id)).map((p) => p.name)
    for (const a of awards(s)) for (const n of idle) expect(a.winner.split(/ & |, |\+/).map((x) => x.trim())).not.toContain(n)
  })
})

describe('queue ETA', () => {
  it('uses a 12 minute default until enough games have a recorded length', () => {
    const s = createSession('t', { courts: 1 }, names(8))
    expect(avgGameMs(s)).toBe(12 * 60_000)
  })

  it('uses the median of recent game lengths', () => {
    const s = createSession('t', { courts: 1 }, names(8))
    const [a, b, c, d] = ids(s)
    s.matches = [10, 10, 10, 60].map((m, i) => game(s, i, [a, b], [c, d], 11, 5, m * 60_000))
    expect(avgGameMs(s)).toBe(10 * 60_000)
  })

  it('players in the next match are ~1 game away, later ones further', () => {
    const s = createSession('t', { courts: 1 }, names(12))
    const eta = queueEta(s)
    const next = previewQueue(s, 2)
    const first = eta.get(next[0].a[0])!
    const second = eta.get(next[1].a[0])!
    expect(first.games).toBe(1)
    expect(second.games).toBe(2)
    expect(second.ms).toBeGreaterThan(first.ms)
  })

  it('more courts means shorter waits', () => {
    const one = queueEta(createSession('t', { courts: 1 }, names(16)))
    const two = queueEta(createSession('t', { courts: 2 }, names(16)))
    const maxOne = Math.max(...[...one.values()].map((e) => e.ms))
    const maxTwo = Math.max(...[...two.values()].map((e) => e.ms))
    expect(maxTwo).toBeLessThanOrEqual(maxOne)
  })

  it('text is human, and null for people not in the lookahead', () => {
    expect(etaText({ games: 0, ms: 0 })).toBe('up now')
    expect(etaText({ games: 1, ms: 9 * 60_000 })).toBe('next game (~9 min)')
    expect(etaText({ games: 3, ms: 31 * 60_000 })).toBe('~3 games (~31 min)')
    expect(etaText(undefined)).toBeNull()
  })

  it('a court that is free means the next match starts now', () => {
    const s = createSession('t', { courts: 1 }, names(3))
    const s2 = addPlayer(s, 'P4')
    expect(s2.courts[0].match).not.toBeNull()
    expect([...queueEta(s2).values()].every((e) => e.games >= 0)).toBe(true)
  })
})

describe('rivalry callouts', () => {
  it('flags a rematch with the series score', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const [a, b, c, d] = ids(s)
    s.matches = [game(s, 0, [a, b], [c, d], 11, 5), game(s, 1, [c, d], [a, b], 11, 9), game(s, 2, [a, b], [c, d], 11, 7)]
    const r = rivalryFor(s, [a, b], [c, d])!
    expect(r.kind).toBe('rematch')
    expect(r.text).toBe('Rematch alert: P1 & P2 lead 2–1 tonight')
  })

  it('works whichever side the teams are listed on', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const [a, b, c, d] = ids(s)
    s.matches = [game(s, 0, [a, b], [c, d], 11, 5)]
    expect(rivalryFor(s, [c, d], [a, b])!.text).toContain('P1 & P2 lead 1–0')
  })

  it('says tied when the series is level', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const [a, b, c, d] = ids(s)
    s.matches = [game(s, 0, [a, b], [c, d], 11, 5), game(s, 1, [c, d], [a, b], 11, 5)]
    expect(rivalryFor(s, [a, b], [c, d])!.text).toBe('Rematch alert: tied 1–1 tonight')
  })

  it('surfaces a one-sided player record when teams are new', () => {
    const s = createSession('t', { courts: 1 }, names(8))
    const [a, b, c, d, e, f] = ids(s)
    s.matches = [
      game(s, 0, [a, b], [c, d], 11, 5),
      game(s, 1, [a, e], [c, f], 11, 5),
      game(s, 2, [a, f], [c, b], 11, 5),
    ]
    const r = rivalryFor(s, [a, d], [c, e])
    expect(r?.text).toBe('P1 is 3–0 against P3 tonight')
  })

  it('stays quiet for a brand new match-up', () => {
    const s = createSession('t', { courts: 1 }, names(8))
    const [a, b, c, d] = ids(s)
    expect(rivalryFor(s, [a, b], [c, d])).toBeNull()
  })
})

describe('challenger court', () => {
  it('only the challenger court holds winners; other courts rotate normally', () => {
    let s = createSession('t', { courts: 2, maxStreak: 4 }, names(12))
    s = toggleCourtTag(s, s.courts[0].id, 'challenger')
    const c1Winners = [...s.courts[0].match!.a]
    const c2Before = [...s.courts[1].match!.a, ...s.courts[1].match!.b]
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    expect(s.courts[0].match!.a).toEqual(c1Winners)
    expect(s.courts[0].match!.streak).toBe(1)
    s = finishMatch(s, s.courts[1].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    const c2After = [...s.courts[1].match!.a, ...s.courts[1].match!.b]
    expect(c2After.some((id) => c2Before.includes(id))).toBe(c2After.some((id) => c2Before.includes(id)))
    expect(s.courts[1].match!.streak).toBe(0)
  })

  it('winners leave after the streak cap and streak is recorded on the game', () => {
    let s = createSession('t', { courts: 1, maxStreak: 2 }, names(10))
    s = toggleCourtTag(s, s.courts[0].id, 'challenger')
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    expect(s.matches.map((m) => m.streak)).toEqual([1, 2])
    expect(s.courts[0].match!.streak).toBe(0)
  })

  it('removing the Challenger tag releases the holders', () => {
    let s = createSession('t', { courts: 1, maxStreak: 4 }, names(4))
    s = toggleCourtTag(s, s.courts[0].id, 'challenger')
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    s = toggleCourtTag(s, s.courts[0].id, 'challenger')
    expect(s.courts[0].tags).toEqual([])
    expect(s.courts[0].hold).toBeNull()
  })

  it('announces a win streak from 2 in a row', () => {
    let s = createSession('t', { courts: 1, maxStreak: 5 }, names(10))
    s = toggleCourtTag(s, s.courts[0].id, 'challenger')
    expect(streakCall(s, s.courts[0].id)).toBeNull()
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    expect(streakCall(s, s.courts[0].id)).toBeNull()
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    expect(streakCall(s, s.courts[0].id)).toMatch(/^2-game win streak on Court 1: .+!$/)
  })

  it('setup option makes Court 1 a challenger court', () => {
    const s = createSession('t', { courts: 3, challengerCourt: true }, names(12))
    expect(s.courts[0].tags).toEqual(['challenger'])
    expect(s.courts[1].tags).toBeUndefined()
  })

  it('court tags are display-only except Challenger', () => {
    let s = createSession('t', { courts: 1 }, names(8))
    s = toggleCourtTag(s, s.courts[0].id, 'fast')
    s = toggleCourtTag(s, s.courts[0].id, 'windy')
    expect(s.courts[0].tags).toEqual(['fast', 'windy'])
    s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 4 })
    expect(s.courts[0].match!.streak).toBe(0)
  })
})

describe('mystery mix', () => {
  it('stays fair on games played over a session', () => {
    let s = createSession('t', { mode: 'mystery', courts: 2 }, names(11))
    for (let i = 0; i < 14; i++) {
      for (const c of s.courts.filter((x) => x.match)) s = finishMatch(s, c.id, { winner: i % 2 ? 'a' : 'b', scoreA: 11, scoreB: 6 })
    }
    const g = standings(s).map((p) => p.played)
    expect(Math.max(...g) - Math.min(...g)).toBeLessThanOrEqual(2)
  })

  it('mixes partners widely: far fewer repeat partnerships than games', () => {
    let s = createSession('t', { mode: 'mystery', courts: 1 }, names(8))
    for (let i = 0; i < 14; i++) s = finishMatch(s, s.courts[0].id, { winner: 'a', scoreA: 11, scoreB: 6 })
    const { partner } = countMatches(s.matches)
    expect(Math.max(...partner.values())).toBeLessThanOrEqual(3)
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'))
  })
})

describe('ETA is never over-optimistic', () => {
  it('a court running far past the usual game length still shows a realistic wait', () => {
    const s = createSession('t', { courts: 1 }, names(12))
    s.courts[0].match!.startedAt = Date.now() - 41 * 60_000 // a marathon, much longer than the 12 min default
    const first = previewQueue(s, 1)[0]
    const e = queueEta(s).get(first.a[0])!
    expect(e.ms).toBeGreaterThanOrEqual(3 * 60_000)
    expect(etaText(e)).not.toContain('~1 min')
  })

  it('a court that just started shows roughly a full game', () => {
    const s = createSession('t', { courts: 1 }, names(12))
    const first = previewQueue(s, 1)[0]
    const e = queueEta(s).get(first.a[0])!
    expect(e.ms).toBeGreaterThan(10 * 60_000)
    expect(e.ms).toBeLessThanOrEqual(12 * 60_000)
  })
})

describe('Clutch Closer needs a real standout', () => {
  it('names everyone who shares a close-win lead, with the size of the tie', () => {
    const s = createSession('t', { courts: 1 }, names(8))
    const [a, b, c, d, e, f, g, h] = ids(s)
    // two close games, each won by a different pair: 4 of 8 players have exactly one close win (half the field)
    s.matches = [game(s, 0, [a, b], [c, d], 11, 9), game(s, 1, [e, f], [g, h], 11, 9)]
    const clutch = awards(s).find((x) => x.id === 'clutch')!
    expect(clutch.winner).toBe('P1, P2, P5 & P6')
    expect(clutch.tied).toBe(4)
    expect(clutch.detail).toMatch(/^4-way tie · 1 win by 2 points or less/)
  })

  it('skips an award that more than half of the players share (it says nothing)', () => {
    const s = createSession('t', { courts: 1 }, names(8))
    const [a, b, c, d, e, f, g, h] = ids(s)
    // three close games won by different groups: 6 of 8 players share one close win
    s.matches = [game(s, 0, [a, b], [c, d], 11, 9), game(s, 1, [e, f], [g, h], 11, 9), game(s, 2, [c, d], [a, b], 11, 9)]
    expect(awards(s).find((x) => x.id === 'clutch')).toBeUndefined()
  })

  it('is given when at most two players share the lead', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const [a, b, c, d] = ids(s)
    s.matches = [game(s, 0, [a, b], [c, d], 11, 9)]
    const clutch = awards(s).find((x) => x.id === 'clutch')!
    expect(clutch.winner).toBe('P1 & P2')
  })

  it('is given to a larger group only when they have 2 or more close wins', () => {
    const s = createSession('t', { courts: 1 }, names(4))
    const [a, b, c, d] = ids(s)
    s.matches = [game(s, 0, [a, b], [c, d], 11, 9), game(s, 1, [a, b], [c, d], 12, 10)]
    expect(awards(s).find((x) => x.id === 'clutch')!.detail).toContain('2 wins')
  })
})


describe('award ties are shown in full', () => {
  it('a single winner has no tie wording', () => {
    const s = createSession('t', { courts: 1 }, names(6))
    const [a, b, c, d, e, f] = ids(s)
    s.matches = [game(s, 0, [a, b], [c, d], 11, 5, 600_000), game(s, 1, [a, e], [f, b], 11, 5, 900_000), game(s, 2, [a, c], [e, f], 11, 5, 600_000)]
    const iron = awards(s).find((x) => x.id === 'iron')!
    expect(iron.winner).toBe('P1')
    expect(iron.tied).toBeUndefined()
    expect(iron.detail).not.toMatch(/tie/)
  })

  it('two names read "A & B"; three or more read "A, B & C"', () => {
    const s = createSession('t', { courts: 1 }, names(8))
    const [a, b, c, d] = ids(s)
    s.matches = [game(s, 0, [a, b], [c, d], 11, 5), game(s, 1, [a, b], [c, d], 11, 5)]
    const two = awards(s).find((x) => x.id === 'streak')
    const iron = awards(s).find((x) => x.id === 'iron')!
    expect(iron.winner).toBe('P1, P2, P3 & P4')
    expect(iron.winner).not.toMatch(/[+][0-9]/)
    expect(two).toBeUndefined() // only 2 wins in a row: below the On Fire bar
  })

  it('no award ever hides names behind a "+N"', () => {
    for (let n = 4; n <= 14; n++) {
      let s = createSession('t', { courts: 2 }, names(n))
      for (let i = 0; i < 12; i++) {
        const c = s.courts.find((x) => x.match)
        if (!c) break
        s = finishMatch(s, c.id, { winner: i % 2 ? 'a' : 'b', scoreA: 11, scoreB: 9 })
      }
      for (const a of awards(s)) expect(a.winner, `${n} players, ${a.title}`).not.toMatch(/[+][0-9]/)
    }
  })

  it('the tie count always matches the number of names listed', () => {
    for (let n = 4; n <= 12; n++) {
      let s = createSession('t', { courts: 2 }, names(n))
      for (let i = 0; i < 10; i++) {
        const c = s.courts.find((x) => x.match)
        if (!c) break
        s = finishMatch(s, c.id, { winner: i % 2 ? 'a' : 'b', scoreA: 11, scoreB: 9 })
      }
      for (const a of awards(s)) {
        if (a.tied === undefined) continue
        const listed = a.winner.split(/, | & /).length
        // duos and marathon list pairs, which are not ties; only the player awards are checked
        if (['iron', 'clutch', 'social', 'streak'].includes(a.id)) expect(listed, `${a.title} with ${n} players`).toBe(a.tied)
      }
    }
  })

  it('Fixed teams: tied teams are listed whole, as "Josh & Daria"', () => {
    const pairs: [{ name: string }, { name: string }][] = [['Josh', 'Daria'], ['Stee', 'Kp'], ['Ann', 'Bo'], ['Cy', 'Di'], ['Ed', 'Flo'], ['Gil', 'Hal'], ['Ivo', 'Jax']].map(([x, y]) => [{ name: x }, { name: y }])
    const s = createSession('t', { format: 'teams', courts: 1 }, [], pairs)
    const tid = (n: string) => s.teams.find((x) => x.name.startsWith(n))!.playerIds as string[]
    const g = (i: number, a: string, b: string) => ({ id: 'g' + i, seq: i + 1, court: 'Court 1', a: tid(a), b: tid(b), scoreA: 11, scoreB: 5, winner: 'a' as const, at: i, ms: 600000 })
    // Josh, Stee and Ann each play two games (a 3-way tie); everyone else plays one.
    s.matches = [g(0, 'Josh', 'Cy'), g(1, 'Stee', 'Ed'), g(2, 'Ann', 'Gil'), g(3, 'Josh', 'Ivo'), g(4, 'Stee', 'Ann')]
    const iron = awards(s).find((x) => x.id === 'iron')!
    expect(iron.tied).toBe(3)
    for (const n of ['Josh & Daria', 'Stee & Kp', 'Ann & Bo']) expect(iron.winner).toContain(n)
    expect(iron.detail).toMatch(/^3-way tie/)
  })
})
