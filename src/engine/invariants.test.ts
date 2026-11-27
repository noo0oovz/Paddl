import { describe, expect, it } from 'vitest'
import * as S from './session'
import { busyIds, previewQueue, waitingUnits } from './queue'
import { countMatches, placesOf, playerStandings, podiumOf, standings } from './stats'
import { awards, highlightsNotInAwards, waitMs } from './insights'
import type { Mode, Session } from './types'

/**
 * A long, random, host-abusive night, with the rules that must hold at EVERY step checked after EVERY action:
 * nobody is in two places, a court is never idle while enough people wait, the results add up, and what is shown agrees.
 */
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

function check(s: Session, where: string) {
  const need = s.config.format === 'singles' ? 2 : s.config.format === 'teams' ? 4 : 4
  // 1. nobody is in two places at once, and everyone on a court is an active player of this session
  const onCourt = new Map<string, string>()
  for (const c of s.courts) {
    const ids = c.match ? [...c.match.a, ...c.match.b] : []
    for (const id of ids) {
      expect(onCourt.has(id), `${where}: ${id} is on ${onCourt.get(id)} and ${c.name}`).toBe(false)
      onCourt.set(id, c.name)
      const p = s.players.find((x) => x.id === id)
      expect(p, `${where}: ${id} on ${c.name} is not a player`).toBeTruthy()
      expect(p!.status, `${where}: ${p!.name} is on a court but is ${p!.status}`).toBe('active')
    }
    if (c.match) {
      expect(new Set(ids).size, `${where}: a name twice in one game`).toBe(ids.length)
      expect(c.match.a.length, `${where}: unequal sides`).toBe(c.match.b.length)
    }
  }
  // 2. a player who is on a hold is not also playing
  for (const c of s.courts) if (c.hold) for (const id of c.hold.ids) expect(onCourt.has(id), `${where}: ${id} holds ${c.name} and plays elsewhere`).toBe(false)
  // 3. the waiting line has nobody who is on a court, resting or gone, and no duplicates
  const waiting = waitingUnits(s).flatMap((u) => u.ids)
  expect(new Set(waiting).size, `${where}: duplicate in the waiting line`).toBe(waiting.length)
  for (const id of waiting) {
    expect(onCourt.has(id), `${where}: ${id} is waiting AND playing`).toBe(false)
    expect(s.players.find((p) => p.id === id)!.status, `${where}: a non-active player is waiting`).toBe('active')
  }
  // 4. a court is never idle while a full match is waiting (unless a court is holding for challengers)
  const idle = s.courts.filter((c) => !c.match && !c.hold).length
  if (s.config.mode !== 'winners' && s.config.format !== 'teams') expect(idle === 0 || waiting.length < need, `${where}: ${idle} idle court(s), ${waiting.length} waiting`).toBe(true)
  // 5. every recorded game is sane: two distinct sides of equal size, every player real
  const ids = new Set(s.players.map((p) => p.id))
  for (const m of s.matches) {
    const all = [...m.a, ...m.b]
    expect(new Set(all).size, `${where}: game ${m.id} repeats a player`).toBe(all.length)
    expect(m.a.length, `${where}: game ${m.id} unequal sides`).toBe(m.b.length)
    for (const id of all) expect(ids.has(id), `${where}: game ${m.id} has an unknown player`).toBe(true)
  }
  // 6. the standings add up: every win has a loss, and games played match the history
  const rows = playerStandings(s)
  const wins = rows.reduce((n, r) => n + r.wins, 0), losses = rows.reduce((n, r) => n + r.losses, 0)
  expect(wins, `${where}: wins ${wins} != losses ${losses}`).toBe(losses)
  const counts = countMatches(s.matches)
  for (const r of rows) {
    expect(r.played, `${where}: ${r.name} played`).toBe(counts.games.get(r.id) ?? 0)
    expect(r.wins + r.losses, `${where}: ${r.name} decided games`).toBeLessThanOrEqual(r.played)
    expect(r.wins, `${where}: negative`).toBeGreaterThanOrEqual(0)
  }
  // 7. places: first is 1, never go down, a place equals the position of the first player who has it, the podium agrees
  const st = standings(s)
  const places = placesOf(st)
  if (places.length) expect(places[0], `${where}: first place`).toBe(1)
  places.forEach((p, i) => {
    if (i > 0) expect(p, `${where}: places go down`).toBeGreaterThanOrEqual(places[i - 1])
    if (i === 0 || places[i - 1] !== p) expect(p, `${where}: place number`).toBe(i + 1)
  })
  // equal records MUST share a place, and different records MUST NOT (this is the rule the final standings broke: the same four players were
  // numbered 2, 2, 2, 2 in one place and 2nd, 3rd in another)
  st.forEach((r, i) => {
    if (i === 0) return
    const q = st[i - 1]
    const level = r.wins === q.wins && r.losses === q.losses && r.diff === q.diff
    if (level) expect(places[i], `${where}: ${q.name} and ${r.name} have the same record but different places`).toBe(places[i - 1])
    else expect(places[i], `${where}: ${q.name} and ${r.name} have different records but the same place`).toBeGreaterThan(places[i - 1])
  })
  // the podium holds exactly the people in the top three places who have a win: nobody is left off, nobody extra is on
  { const want = st.filter((r, i) => places[i] <= 3 && r.wins > 0).length; expect(podiumOf(st, 99).length, `${where}: the podium has the wrong number of people`).toBe(want) }
  for (const x of podiumOf(st)) { expect(x.place).toBeLessThanOrEqual(3); expect(x.row.wins).toBeGreaterThan(0); expect(places[st.indexOf(x.row)]).toBe(x.place) }
  // 8. awards: nobody is named twice in one award, highlights do not repeat awards
  const aw = awards(s)
  for (const a of aw) { if (a.who) expect(new Set(a.who).size, `${where}: ${a.title} names someone twice`).toBe(a.who.length) }
  const have = new Set(aw.map((a) => a.id))
  for (const h of highlightsNotInAwards(s)) expect(have.has(h.key === 'duo' ? 'duo' : 'streak'), `${where}: ${h.label} repeats an award`).toBe(false)
  // 9. the preview never names someone who is on a court or two places, and never repeats a person
  const prev = previewQueue(s, 3)
  const seen = new Set<string>(busyIds(s))
  for (const m of prev) for (const id of [...m.a, ...(m.b ?? [])]) { expect(seen.has(id), `${where}: preview reuses ${id}`).toBe(false); seen.add(id) }
  // 10. wait times are never negative or NaN
  for (const p of s.players) { const w = waitMs(s, p.id, Date.now() + 60000); if (w !== null) expect(Number.isFinite(w) && w >= 0, `${where}: wait ${w}`).toBe(true) }
}

const MODES: Mode[] = ['fair', 'skill', 'robin', 'mystery', 'winners']

describe('random nights with a host who does everything', () => {
  for (const mode of MODES) {
    for (const format of ['doubles', 'singles'] as const) {
      it(`${mode} / ${format}: 60 nights of 80 actions keep every rule`, () => {
        for (let seed = 1; seed <= 60; seed++) {
          const r = rng(seed * 7919 + mode.length * 13 + format.length)
          const n = 4 + Math.floor(r() * 14)
          let s: Session = S.createSession('t', { courts: 1 + Math.floor(r() * 4), mode, format, maxInRow: r() < 0.4 ? 2 : 0, lateJoinMedian: r() < 0.7, breakReturn: r() < 0.3 ? 'back' : 'keep' }, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, level: 2.5 + (i % 6) * 0.5 })))
          check(s, `${mode}/${format} seed ${seed} start`)
          for (let step = 0; step < 80; step++) {
            const x = r()
            const live = s.courts.filter((c) => c.match)
            const act = `${mode}/${format} seed ${seed} step ${step}`
            if (x < 0.46 && live.length) { const c = live[Math.floor(r() * live.length)]; s = S.finishMatch(s, c.id, r() < 0.12 ? { winner: null, scoreA: null, scoreB: null } : { winner: r() < 0.5 ? 'a' : 'b', scoreA: r() < 0.5 ? 11 : null, scoreB: null }) }
            else if (x < 0.52) s = S.addPlayer(s, 'L' + step)
            else if (x < 0.60) { const p = s.players[Math.floor(r() * s.players.length)]; s = S.setStatus(s, p.id, p.status === 'active' ? (r() < 0.8 ? 'resting' : 'left') : 'active') }
            else if (x < 0.65) s = S.addCourt(s)
            else if (x < 0.69 && s.courts.length > 1) { const c = s.courts[Math.floor(r() * s.courts.length)]; s = S.removeCourt(s, c.id) }
            else if (x < 0.74) s = S.remixNext(s)
            else if (x < 0.79 && live.length) s = S.remixCourt(s, live[Math.floor(r() * live.length)].id)
            else if (x < 0.83 && s.matches.length) s = S.deleteMatch(s, s.matches[Math.floor(r() * s.matches.length)].id)
            else if (x < 0.87 && s.matches.length) { const m = s.matches[Math.floor(r() * s.matches.length)]; s = S.editMatch(s, m.id, { winner: r() < 0.5 ? 'a' : 'b', scoreA: null, scoreB: null }) }
            else if (x < 0.91) { const w = waitingUnits(s); if (w.length) s = r() < 0.5 ? S.playNext(s, w[Math.floor(r() * w.length)].ids[0]) : S.sendBack(s, w[Math.floor(r() * w.length)].ids[0]) }
            else if (x < 0.95 && live.length) { const c = live[Math.floor(r() * live.length)]; const out = c.match!.a[0]; const w = waitingUnits(s); if (w.length) s = S.substitute(s, c.id, out, w[0].ids[0]) }
            else if (x < 0.97 && live.length) s = S.cancelMatch(s, live[Math.floor(r() * live.length)].id)
            check(s, act)
          }
        }
      })
    }
  }

  it('fixed teams: 40 nights keep every rule', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed * 31337)
      const teams = 3 + Math.floor(r() * 6)
      let s: Session = S.createSession('t', { courts: 1 + Math.floor(r() * 3), format: 'teams' }, [], Array.from({ length: teams }, (_, i) => [{ name: `A${i}` }, { name: `B${i}` }] as [{ name: string }, { name: string }]))
      for (let step = 0; step < 60; step++) {
        const live = s.courts.filter((c) => c.match)
        const x = r()
        if (x < 0.6 && live.length) s = S.finishMatch(s, live[Math.floor(r() * live.length)].id, { winner: r() < 0.5 ? 'a' : 'b', scoreA: null, scoreB: null })
        else if (x < 0.7) { const p = s.players[Math.floor(r() * s.players.length)]; s = S.setStatus(s, p.id, p.status === 'active' ? 'resting' : 'active') }
        else if (x < 0.8) s = S.remixNext(s)
        else if (x < 0.88) s = S.addCourt(s)
        check(s, `teams seed ${seed} step ${step}`)
      }
    }
  })
})
