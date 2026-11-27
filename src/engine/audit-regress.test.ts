import { describe, expect, it } from 'vitest'
import * as S from './session'
import { lineKey as lineKeyOf, previewQueue, waitingUnits } from './queue'
import { playerStandings } from './stats'
import type { Session } from './types'

/**
 * Bugs found by the production audit. Each of these failed before it was fixed; they stay as guards.
 */
const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` }))
const win = (s: Session, courtIdx = 0, side: 'a' | 'b' = 'a') => S.finishMatch(s, s.courts.filter((c) => c.match)[courtIdx].id, { winner: side, scoreA: null, scoreB: null })
const waitingCount = (s: Session) => S.waitingCount(s)

describe('a court is never left idle while enough people are waiting', () => {
  it('Limit games in a row + a deleted game + a late joiner + a new court (doubles)', () => {
    let s = S.createSession('t', { courts: 1, maxInRow: 2 }, names(7))
    for (let i = 0; i < 4; i++) s = win(s)
    s = S.addCourt(s)
    s = S.deleteMatch(s, s.matches[s.matches.length - 1].id)
    s = S.addPlayer(s, 'Late')
    const idle = s.courts.filter((c) => !c.match).length
    expect(idle === 0 || waitingCount(s) < 4, `idle courts ${idle}, waiting ${waitingCount(s)}`).toBe(true)
    // and the Next match box agrees: it must not claim a player is missing when four are waiting
    if (waitingCount(s) >= 4) expect(previewQueue(s, 1).length).toBeGreaterThan(0)
  })

  it('the same with singles', () => {
    let s = S.createSession('t', { courts: 1, format: 'singles', maxInRow: 2 }, names(3))
    for (let i = 0; i < 2; i++) s = win(s)
    s = S.deleteMatch(s, s.matches[s.matches.length - 1].id)
    s = S.addPlayer(s, 'Late')
    s = S.addCourt(s)
    const idle = s.courts.filter((c) => !c.match).length
    expect(idle === 0 || waitingCount(s) < 2, `idle ${idle}, waiting ${waitingCount(s)}`).toBe(true)
  })

  it('holds under random abuse with the limit on: delete, add, break, back, add court', () => {
    function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
    for (let seed = 1; seed <= 150; seed++) {
      const r = rng(seed)
      let s = S.createSession('t', { courts: 1 + Math.floor(r() * 3), maxInRow: 2, format: r() < 0.3 ? 'singles' : 'doubles' }, names(4 + Math.floor(r() * 8)))
      for (let i = 0; i < 60; i++) {
        const x = r(), live = s.courts.filter((c) => c.match)
        if (x < 0.5 && live.length) s = win(s, Math.floor(r() * live.length), r() < 0.5 ? 'a' : 'b')
        else if (x < 0.6 && s.matches.length) s = S.deleteMatch(s, s.matches[Math.floor(r() * s.matches.length)].id)
        else if (x < 0.7) s = S.addPlayer(s, 'L' + i)
        else if (x < 0.8) s = S.addCourt(s)
        else if (x < 0.9) { const p = s.players[Math.floor(r() * s.players.length)]; s = S.setStatus(s, p.id, p.status === 'active' ? 'resting' : 'active') }
        const need = s.config.format === 'singles' ? 2 : 4
        const idle = s.courts.filter((c) => !c.match && !c.hold).length
        expect(idle === 0 || waitingCount(s) < need, `seed ${seed} step ${i}: ${idle} idle court(s) with ${waitingCount(s)} waiting`).toBe(true)
      }
    }
  })
})

describe('"Play next" is used up once the player is on court', () => {
  it('a Play-next player who steps in because someone took a break does not get a second game ahead of people with fewer', () => {
    let s = S.createSession('t', { courts: 1 }, names(9))
    // P5 has the fewest games like everyone waiting; give a clear Play-next to one waiting player
    const waiting = S.createSession('t', { courts: 1 }, names(9)) // same ids
    const target = s.players.find((p) => p.name === 'P6')!
    s = S.playNext(s, target.id)
    // someone ON the court takes a break: the first in line (the Play-next player) steps in
    const onCourt = s.courts[0].match!.a[0]
    s = S.setStatus(s, onCourt, 'resting')
    const t = s.players.find((p) => p.id === target.id)!
    const isOn = s.courts[0].match && [...s.courts[0].match.a, ...s.courts[0].match.b].includes(target.id)
    if (isOn) expect(t.prio, 'the one-time override is used up as soon as they are on court').toBeUndefined()
    // finish the game: nobody with fewer games may wait while the Play-next player plays again
    s = win(s)
    const stand = playerStandings(s)
    const mine = stand.find((p) => p.id === target.id)!
    const fewest = Math.min(...stand.filter((p) => p.status === 'active').map((p) => p.played))
    const live = s.courts[0].match ? [...s.courts[0].match.a, ...s.courts[0].match.b] : []
    if (live.includes(target.id)) expect(mine.played, 'they must not be drawn again ahead of people with fewer games').toBeLessThanOrEqual(fewest + 1)
    void waiting
  })
})

describe('"Redraw next" shows exactly what starts, and never skips people with fewer games', () => {
  it('9 players on 1 court: redraw, then finish the game', () => {
    let broken = 0, checked = 0
    for (let n = 6; n <= 11; n++) {
      for (let tries = 0; tries < 8; tries++) {
        let s = S.createSession('t', { courts: 1 }, names(n))
        for (let k = 0; k < tries % 3; k++) s = win(s)
        for (let k = 0; k <= tries; k++) s = S.remixNext(s)
        const promised = previewQueue(s, 1)[0]
        const counts = new Map(playerStandings(s).map((p) => [p.id, p.played]))
        s = win(s)
        const started = s.courts[0].match
        if (!promised?.b || !started) continue
        checked++
        const a = [...promised.a, ...promised.b].sort().join(), b2 = [...started.a, ...started.b].sort().join()
        if (a !== b2) broken++
        // nobody who started may have MORE games (before this one) than someone left waiting with fewer, among the active
        const inGame = new Set([...started.a, ...started.b])
        const waitingNow = s.players.filter((p) => p.status === 'active' && !inGame.has(p.id))
        const before = (id: string) => (counts.get(id) ?? 0)
        const worstPlayer = Math.max(...[...inGame].map(before)), bestWaiting = Math.min(...waitingNow.map((p) => before(p.id)), 99)
        if (worstPlayer > bestWaiting + 1) broken++
      }
    }
    expect(checked).toBeGreaterThan(20)
    expect(broken, `${broken} of ${checked} redraws did not start what was shown, or skipped someone with fewer games`).toBe(0)
  })
})

describe('a pinned "Redraw next" only lasts as long as the line it was chosen from', () => {
  const sig = (m: { a: string[]; b: string[] | null } | undefined) => (m ? [...m.a, ...(m.b ?? [])].sort().join() : '')

  it('pressing Redraw again gives a different match, not the same pinned one', () => {
    let seen = new Set<string>()
    let s = S.createSession('t', { courts: 1 }, names(10))
    for (let i = 0; i < 12; i++) { s = S.remixNext(s); seen.add(sig(previewQueue(s, 1)[0])) }
    expect(seen.size, 'twelve redraws should show more than one match').toBeGreaterThan(2)
  })
  it('the match shown after a redraw is exactly what starts, even with the courts all busy first', () => {
    for (let n = 7; n <= 13; n++) {
      let s = S.createSession('t', { courts: 2 }, names(n))
      s = S.remixNext(s)
      const shown = sig(previewQueue(s, 1)[0])
      s = win(s, 0)
      const started = s.courts.filter((c) => c.match).map((c) => sig({ a: c.match!.a, b: c.match!.b })).includes(shown)
      if (shown) expect(started, `${n} players: shown ${shown}`).toBe(true)
    }
  })
  it('adding a late player voids the pin, so the newcomer is not ignored', () => {
    let s = S.createSession('t', { courts: 1 }, names(8))
    s = S.remixNext(s)
    expect(s.pinned).toBeTruthy()
    s = S.addPlayer(s, 'Late')
    const shown = previewQueue(s, 1)[0]
    // the pin named players from the old line; with it void, the line is drawn fresh and still returns a valid match
    expect(shown?.b).toBeTruthy()
    expect(new Set([...shown!.a, ...shown!.b!]).size).toBe(4)
  })
  it('a break, Play next and Send to back each void it: the line it was chosen from is gone', () => {
    const pinnedLine = (s: Session) => s.pinned?.line
    for (const [label, act] of [
      ['a break', (s: Session) => S.setStatus(s, s.players[7].id, 'resting')],
      ['Play next', (s: Session) => S.playNext(s, s.players[6].id)],
      ['Send to back', (s: Session) => S.sendBack(s, s.players[5].id)],
      ['a late joiner', (s: Session) => S.addPlayer(s, 'Late')],
    ] as const) {
      let s = S.createSession('t', { courts: 1 }, names(9))
      s = S.remixNext(s)
      const pinned = s.pinned
      expect(pinned, label + ': there is a pin to begin with').toBeTruthy()
      s = act(s)
      // the pin is kept in the data but is now void: its fingerprint no longer matches the line
      expect(pinnedLine(s) === lineKeyOf(s), label + ': the pin must no longer match the line').toBe(false)
      // and the preview is a normal, valid match drawn from the CURRENT line (not the stale pinned players)
      const m = previewQueue(s, 1)[0]
      expect(m?.b, label).toBeTruthy()
      expect(new Set([...m!.a, ...m!.b!]).size, label).toBe(4)
    }
  })
  it('a pin never survives across a game start (it is used once)', () => {
    let s = S.createSession('t', { courts: 1 }, names(9))
    s = S.remixNext(s)
    s = win(s)
    expect(s.pinned ?? null).toBeNull()
  })
  it('old saved sessions with no pin behave exactly as before', () => {
    const s = S.createSession('t', { courts: 2 }, names(10))
    delete (s as { pinned?: unknown }).pinned
    expect(() => { let x = s; for (let i = 0; i < 10; i++) x = win(x, i % 2) }).not.toThrow()
  })
})

describe('Play next is used up when the player goes on court as a substitute', () => {
  it('a Play-next player who steps in because someone on court took a break does not play again straight away', () => {
    let s = S.createSession('t', { courts: 1 }, names(9))
    const line = waitingUnits(s).map((u) => u.ids[0])
    const target = line[line.length - 1] // the player who would normally be LAST in line
    s = S.playNext(s, target)
    const onCourt = s.courts[0].match!.a[0]
    s = S.setStatus(s, onCourt, 'resting') // the first in line (the Play-next player) steps in
    const nowOn = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    expect(nowOn.includes(target), 'the Play-next player stepped in').toBe(true)
    expect(s.players.find((p) => p.id === target)!.prio, 'their one-time override is used up now they are on court').toBeUndefined()
    s = win(s)
    const again = s.courts[0].match ? [...s.courts[0].match.a, ...s.courts[0].match.b].includes(target) : false
    expect(again, 'they must not be drawn straight back on while players with 0 games wait').toBe(false)
  })
  it('the same when the player LEAVES instead of taking a break', () => {
    let s = S.createSession('t', { courts: 1 }, names(9))
    const line = waitingUnits(s).map((u) => u.ids[0])
    const target = line[line.length - 1]
    s = S.playNext(s, target)
    s = S.setStatus(s, s.courts[0].match!.b[0], 'left')
    expect(s.players.find((p) => p.id === target)!.prio).toBeUndefined()
  })
})

describe('review round: stale pins and fixed teams', () => {
  const sig2 = (m: { a: string[]; b: string[] | null } | undefined) => (m ? [...m.a, ...(m.b ?? [])].sort().join() : '')

  it('Reshuffling a court game does not hand it the pinned next match, and the pin does not replay later', () => {
    let s = S.createSession('t', { courts: 2 }, names(12))
    s = S.remixNext(s)
    const shown = sig2(previewQueue(s, 1)[0])
    s = S.remixCourt(s, s.courts[0].id)
    expect(s.pinned ?? null, 'the court redraw voids the pin').toBeNull()
    // whatever Court 1 now plays, finishing it must not put the very same four straight back on
    const before = sig2({ a: s.courts[0].match!.a, b: s.courts[0].match!.b })
    s = win(s, 0)
    const after = s.courts[0].match ? sig2({ a: s.courts[0].match.a, b: s.courts[0].match.b }) : ''
    expect(after, 'the same four must not play back to back').not.toBe(before)
    void shown
  })

  it('a pin whose players were put on a court by hand is dropped', () => {
    let s = S.createSession('t', { courts: 1 }, names(9))
    s = S.remixNext(s)
    expect(s.pinned).toBeTruthy()
    const pinnedId = s.pinned!.a[0]
    const out = s.courts[0].match!.a[0]
    s = S.substitute(s, s.courts[0].id, out, pinnedId)
    expect(s.pinned ?? null, 'a pinned player stepping in voids the pin').toBeNull()
  })

  it('Redraw next works for fixed teams: the pin is honoured, whatever the fallback draw would have picked', () => {
    // The pin is what makes the shown match start. Prove it is USED, not that the fallback happens to agree: hand-set a valid pin
    // that the normal draw would not choose, and check that exactly that match starts.
    const pairs = Array.from({ length: 8 }, (_, i) => [{ name: `A${i}` }, { name: `B${i}` }] as [{ name: string }, { name: string }])
    let s = S.createSession('t', { courts: 1, format: 'teams' }, [], pairs)
    const waiting = waitingUnits(s)
    const last = waiting[waiting.length - 1], second = waiting[waiting.length - 2] // the two who would be LAST in line
    s = { ...s, pinned: { a: [...last.ids], b: [...second.ids], line: lineKeyOf(s) } }
    s = win(s)
    const started = s.courts[0].match!
    expect(sig2({ a: started.a, b: started.b }), 'the pinned teams are the ones that start').toBe(sig2({ a: [...last.ids], b: [...second.ids] }))
  })
})
