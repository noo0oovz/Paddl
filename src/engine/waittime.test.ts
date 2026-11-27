import { describe, expect, it, vi } from 'vitest'
import * as S from './session'
import { groupWaitMs, waitMs } from './insights'
import { waitingUnits } from './queue'
import type { Session } from './types'

const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}` }))
const MIN = 60_000

/** Run a function with the clock set to `t`, so games and joins get predictable times. */
function at<T>(t: number, fn: () => T): T {
  vi.useFakeTimers(); vi.setSystemTime(t)
  try { return fn() } finally { vi.useRealTimers() }
}
const T0 = 1_700_000_000_000
const finishFirst = (s: Session, t: number) => at(t, () => S.finishMatch(s, s.courts.find((c) => c.match)!.id, { winner: 'a', scoreA: null, scoreB: null }))

describe('how long someone has been waiting', () => {
  it('counts from the start of the session for someone who has not played yet', () => {
    const s = at(T0, () => S.createSession('t', { courts: 1 }, names(8)))
    const waiting = waitingUnits(s).map((u) => u.ids[0])
    expect(waiting.length).toBe(4)
    for (const id of waiting) expect(waitMs(s, id, T0 + 7 * MIN)).toBe(7 * MIN)
  })

  it('is null for players on a court, on a break, or who have left', () => {
    let s = at(T0, () => S.createSession('t', { courts: 1 }, names(8)))
    const on = s.courts[0].match!.a[0]
    expect(waitMs(s, on, T0 + MIN)).toBeNull()
    const w = waitingUnits(s)[0].ids[0]
    s = at(T0 + MIN, () => S.setStatus(s, w, 'resting'))
    expect(waitMs(s, w, T0 + 2 * MIN)).toBeNull()
    s = at(T0 + MIN, () => S.setStatus(s, waitingUnits(s)[0].ids[0], 'left'))
    expect(waitMs(s, 'nobody', T0)).toBeNull()
  })

  it('restarts from the moment a game finishes', () => {
    let s = at(T0, () => S.createSession('t', { courts: 1 }, names(8)))
    const first = [...s.courts[0].match!.a, ...s.courts[0].match!.b]
    s = finishFirst(s, T0 + 10 * MIN)
    const back = first.find((id) => waitMs(s, id, T0 + 10 * MIN) !== null)
    // someone who was on court is waiting again, and has waited 0 right after, then 3 minutes later 3
    const who = first.filter((id) => waitMs(s, id, T0 + 13 * MIN) !== null)
    expect(who.length).toBeGreaterThan(0)
    for (const id of who) expect(waitMs(s, id, T0 + 13 * MIN)).toBe(3 * MIN)
    void back
  })

  it('a late joiner starts at zero, not at the start of the session', () => {
    let s = at(T0, () => S.createSession('t', { courts: 1 }, names(8)))
    s = at(T0 + 20 * MIN, () => S.addPlayer(s, 'Late'))
    const late = s.players.find((p) => p.name === 'Late')!
    expect(waitMs(s, late.id, T0 + 25 * MIN)).toBe(5 * MIN)
  })

  it('time on a break does not count as waiting', () => {
    let s = at(T0, () => S.createSession('t', { courts: 1 }, names(8)))
    const w = waitingUnits(s)[0].ids[0]
    s = at(T0 + 5 * MIN, () => S.setStatus(s, w, 'resting'))
    s = at(T0 + 30 * MIN, () => S.setStatus(s, w, 'active'))
    expect(waitMs(s, w, T0 + 32 * MIN), 'back for 2 minutes, not 32').toBe(2 * MIN)
  })

  it('a session saved before this existed (no joinedAt) falls back to when the session began', () => {
    const s = at(T0, () => S.createSession('t', { courts: 1 }, names(8)))
    for (const p of s.players) delete (p as { joinedAt?: number }).joinedAt
    const w = waitingUnits(s)[0].ids[0]
    expect(waitMs(s, w, T0 + 4 * MIN)).toBe(4 * MIN - (T0 - s.createdAt))
    expect(waitMs(s, w, s.createdAt + 4 * MIN)).toBe(4 * MIN)
  })

  it('never negative, even if the clock went backwards', () => {
    const s = at(T0, () => S.createSession('t', { courts: 1 }, names(8)))
    const w = waitingUnits(s)[0].ids[0]
    expect(waitMs(s, w, T0 - 5 * MIN)).toBe(0)
  })

  it('a fixed team has waited as long as its SHORTER member (it needs both)', () => {
    const pairs = Array.from({ length: 4 }, (_, i) => [{ name: `A${i}` }, { name: `B${i}` }] as [{ name: string }, { name: string }])
    let s = at(T0, () => S.createSession('t', { courts: 1, format: 'teams' }, [], pairs))
    const team = waitingUnits(s)[0].ids
    const [x, y] = team
    s = at(T0 + 6 * MIN, () => S.setStatus(s, x, 'resting'))
    s = at(T0 + 8 * MIN, () => S.setStatus(s, x, 'active'))
    // y has waited the whole time; x only since coming back
    expect(groupWaitMs(s, [x, y], T0 + 10 * MIN)).toBe(waitMs(s, x, T0 + 10 * MIN))
  })

  it('group wait is null when nobody in it is waiting', () => {
    const s = at(T0, () => S.createSession('t', { courts: 1 }, names(8)))
    expect(groupWaitMs(s, [...s.courts[0].match!.a], T0 + MIN)).toBeNull()
  })
})

import { longestWait, waitText } from './insights'
describe('how the wait is shown', () => {
  it('says nothing under a minute, minutes up to an hour, then hours', () => {
    expect(waitText(null)).toBeNull()
    expect(waitText(0)).toBeNull()
    expect(waitText(59_999)).toBeNull()
    expect(waitText(60_000)).toBe('waited 1 min')
    expect(waitText(8 * MIN + 30_000)).toBe('waited 8 min')
    expect(waitText(59 * MIN)).toBe('waited 59 min')
    expect(waitText(60 * MIN)).toBe('waited 1 h 0 min')
    expect(waitText(135 * MIN)).toBe('waited 2 h 15 min')
  })

  it('picks the longest waiter, and only when it is a real wait', () => {
    const s = at(T0, () => S.createSession('t', { courts: 1 }, names(10)))
    const groups = waitingUnits(s).map((u) => u.ids)
    expect(longestWait(s, groups, T0 + 2 * MIN), 'two minutes in: nobody has really waited').toBeNull()
    const r = longestWait(s, groups, T0 + 9 * MIN)
    expect(r).not.toBeNull()
    expect(r!.ms).toBe(9 * MIN)
  })

  it('a late joiner is not the longest, and nobody waiting gives null', () => {
    let s = at(T0, () => S.createSession('t', { courts: 1 }, names(8)))
    s = at(T0 + 10 * MIN, () => S.addPlayer(s, 'Late'))
    const late = s.players.find((p) => p.name === 'Late')!
    const groups = waitingUnits(s).map((u) => u.ids)
    const r = longestWait(s, groups, T0 + 12 * MIN)
    expect(groups[r!.index]).not.toContain(late.id)
    expect(longestWait(s, [], T0)).toBeNull()
  })
})

import { boardStats } from './insights'
describe('the Board header numbers', () => {
  it('counts games, people in the session, who is waiting, and the longest real wait', () => {
    let s = at(T0, () => S.createSession('t', { courts: 1 }, names(10)))
    const b0 = boardStats(s, T0 + MIN)
    expect(b0).toEqual({ games: 0, playing: 10, waiting: 6, longestWaitMs: null }) // 4 on court, 6 waiting, no real wait yet
    expect(boardStats(s, T0 + 8 * MIN).longestWaitMs).toBe(8 * MIN)
    s = finishFirst(s, T0 + 9 * MIN)
    const b1 = boardStats(s, T0 + 9 * MIN)
    expect(b1.games).toBe(1)
    expect(b1.playing).toBe(10)
    expect(b1.waiting).toBe(6) // four came off, four went on: still six waiting
  })
  it('people on a break are not playing or waiting, and a late joiner counts as waiting', () => {
    let s = at(T0, () => S.createSession('t', { courts: 1 }, names(10)))
    const w = waitingUnits(s)[0].ids[0]
    s = at(T0 + MIN, () => S.setStatus(s, w, 'resting'))
    expect(boardStats(s, T0 + 2 * MIN)).toMatchObject({ playing: 9, waiting: 5 })
    s = at(T0 + 3 * MIN, () => S.addPlayer(s, 'Late'))
    expect(boardStats(s, T0 + 4 * MIN)).toMatchObject({ playing: 10, waiting: 6 })
  })
})
