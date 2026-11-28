import { describe, expect, it } from 'vitest'
import * as S from './session'
import { busyIds, previewQueue, waitingUnits } from './queue'
import { countMatches, placesOf, playerStandings, podiumOf, standings } from './stats'
import { awards, boardStats, highlightsNotInAwards } from './insights'
import { sessionProblem } from '../lib/backup'
import type { Mode, Session } from './types'

/**
 * The actions the first stress test did not use: renaming, skill levels, pulling someone out, changing the mode or the rules in the
 * MIDDLE of a night, swapping the next match, setting the number of courts, court badges, ending and re-opening a session, and
 * adding fixed teams late. After every one of them the same rules must hold, and the session must still be one the app can save and load.
 */
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

function rules(s: Session, where: string) {
  const need = s.config.format === 'singles' ? 2 : 4
  const on = new Map<string, string>()
  for (const c of s.courts) {
    const ids = c.match ? [...c.match.a, ...c.match.b] : []
    for (const id of ids) {
      expect(on.has(id), `${where}: ${id} is on ${on.get(id)} and ${c.name}`).toBe(false); on.set(id, c.name)
      expect(s.players.find((p) => p.id === id)?.status, `${where}: a non-active player is on ${c.name}`).toBe('active')
    }
    if (s.endedAt) expect(c.match, `${where}: a game is still running after the session ended`).toBeNull()
  }
  const ids = new Set(s.players.map((p) => p.id))
  const names = s.players.map((p) => p.name.toLowerCase())
  expect(new Set(names).size, `${where}: two players with the same name`).toBe(names.length)
  for (const p of s.players) expect(p.name.trim().length, `${where}: an empty name`).toBeGreaterThan(0)
  for (const m of s.matches) for (const id of [...m.a, ...m.b]) expect(ids.has(id), `${where}: a game names an unknown player`).toBe(true)
  if (!s.endedAt && s.config.mode !== 'winners' && s.config.format !== 'teams') {
    const idle = s.courts.filter((c) => !c.match && !c.hold).length
    expect(idle === 0 || waitingUnits(s).flatMap((u) => u.ids).length < need, `${where}: an idle court with a full match waiting`).toBe(true)
  }
  expect(s.courts.length, `${where}: no courts`).toBeGreaterThanOrEqual(1)
  expect(s.config.courts, `${where}: the court setting disagrees with the courts`).toBe(s.courts.length)
  const rows = playerStandings(s)
  expect(rows.reduce((n, r) => n + r.wins, 0), `${where}: wins and losses do not balance`).toBe(rows.reduce((n, r) => n + r.losses, 0))
  const counts = countMatches(s.matches)
  for (const r of rows) expect(r.played, `${where}: ${r.name} played`).toBe(counts.games.get(r.id) ?? 0)
  const st = standings(s), places = placesOf(st)
  places.forEach((p, i) => { if (i === 0) expect(p).toBe(1); else expect(p).toBeGreaterThanOrEqual(places[i - 1]) })
  for (const x of podiumOf(st)) expect(places[st.indexOf(x.row)]).toBe(x.place)
  const aw = awards(s); const have = new Set(aw.map((a) => a.id))
  for (const h of highlightsNotInAwards(s)) expect(have.has(h.key), `${where}: ${h.label} repeats an award`).toBe(false)
  const b = boardStats(s); expect(b.playing >= b.waiting, `${where}: more waiting than playing`).toBe(true)
  const seen = new Set<string>(busyIds(s))
  for (const m of previewQueue(s, 3)) for (const id of [...m.a, ...(m.b ?? [])]) { expect(seen.has(id), `${where}: the preview reuses ${id}`).toBe(false); seen.add(id) }
  // the session must survive being saved and loaded: this is what a refresh or a backup does
  const round = JSON.parse(JSON.stringify(s))
  expect(sessionProblem(round), `${where}: the saved session is rejected on load`).toBeNull()
}

const MODES: Mode[] = ['fair', 'skill', 'robin', 'mystery', 'winners']

describe('actions the first stress test left out', () => {
  for (const format of ['doubles', 'singles'] as const) {
    it(`${format}: 80 nights with renames, levels, pull-outs, mode and rule changes, court counts, badges, end and re-open`, () => {
      for (let seed = 1; seed <= 80; seed++) {
        const r = rng(seed * 104729 + format.length)
        const n = 5 + Math.floor(r() * 12)
        let s: Session = S.createSession('t', { courts: 1 + Math.floor(r() * 3), mode: MODES[Math.floor(r() * MODES.length)], format }, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, level: 2.5 + (i % 6) * 0.5 })))
        for (let step = 0; step < 70; step++) {
          const x = r(); const live = s.courts.filter((c) => c.match); const where = `${format} seed ${seed} step ${step}`
          if (s.endedAt) { if (r() < 0.5) s = S.reopenSession(s); rules(s, where + ' (ended)'); continue }
          if (x < 0.30 && live.length) s = S.finishMatch(s, live[Math.floor(r() * live.length)].id, { winner: r() < 0.5 ? 'a' : 'b', scoreA: null, scoreB: null })
          else if (x < 0.36) { const p = s.players[Math.floor(r() * s.players.length)]; const nm = r() < 0.2 ? p.name.toUpperCase() : r() < 0.3 ? s.players[Math.floor(r() * s.players.length)].name : `R${step}`; s = S.renamePlayer(s, p.id, nm) }
          else if (x < 0.41) { const p = s.players[Math.floor(r() * s.players.length)]; s = S.setLevel(s, p.id, 1 + r() * 6) }
          else if (x < 0.47 && live.length) { const c = live[Math.floor(r() * live.length)]; s = S.pullOut(s, [...c.match!.a, ...c.match!.b][Math.floor(r() * 4)]) }
          else if (x < 0.53) s = S.setMode(s, MODES[Math.floor(r() * MODES.length)])
          else if (x < 0.58) s = S.setConfig(s, { target: [11, 15, 21][Math.floor(r() * 3)], maxStreak: 1 + Math.floor(r() * 5), maxInRow: Math.floor(r() * 4), lateJoinMedian: r() < 0.5, winBy2: r() < 0.5 })
          else if (x < 0.63) { const w = waitingUnits(s); if (w.length) s = S.swapOutOfNext(s, w[Math.floor(r() * w.length)].ids[0]) }
          else if (x < 0.68) s = S.setCourts(s, 1 + Math.floor(r() * 5))
          else if (x < 0.72) { const c = s.courts[Math.floor(r() * s.courts.length)]; s = S.toggleCourtTag(s, c.id, (['fast', 'beginner', 'challenger', 'windy'] as const)[Math.floor(r() * 4)]) }
          else if (x < 0.76) s = S.addPlayer(s, r() < 0.3 ? '  Spaced   Name ' : 'L' + step)
          else if (x < 0.80) { const p = s.players[Math.floor(r() * s.players.length)]; s = S.setStatus(s, p.id, p.status === 'active' ? 'resting' : 'active') }
          else if (x < 0.84) s = S.remixNext(s)
          else if (x < 0.87 && s.matches.length) s = S.deleteMatch(s, s.matches[Math.floor(r() * s.matches.length)].id)
          else if (x < 0.89) s = S.endSession(s)
          rules(s, where)
        }
      }
    })
  }

  it('fixed teams: late teams, renames, pull-outs, court changes and end/re-open keep every rule', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = rng(seed * 6007)
      let s: Session = S.createSession('t', { courts: 1 + Math.floor(r() * 3), format: 'teams' }, [], Array.from({ length: 3 + Math.floor(r() * 5) }, (_, i) => [{ name: `A${i}` }, { name: `B${i}` }] as [{ name: string }, { name: string }]))
      for (let step = 0; step < 60; step++) {
        const x = r(); const live = s.courts.filter((c) => c.match); const where = `teams seed ${seed} step ${step}`
        if (s.endedAt) { if (r() < 0.6) s = S.reopenSession(s); rules(s, where + ' (ended)'); continue }
        if (x < 0.4 && live.length) s = S.finishMatch(s, live[Math.floor(r() * live.length)].id, { winner: r() < 0.5 ? 'a' : 'b', scoreA: null, scoreB: null })
        else if (x < 0.5) s = S.addTeam(s, { name: `X${step}` }, { name: `Y${step}` })
        else if (x < 0.58) { const p = s.players[Math.floor(r() * s.players.length)]; s = S.renamePlayer(s, p.id, `N${step}`) }
        else if (x < 0.66 && live.length) { const c = live[Math.floor(r() * live.length)]; s = S.pullOut(s, c.match!.a[0]) }
        else if (x < 0.74) { const p = s.players[Math.floor(r() * s.players.length)]; s = S.setStatus(s, p.id, p.status === 'active' ? 'resting' : 'active') }
        else if (x < 0.82) s = S.setCourts(s, 1 + Math.floor(r() * 4))
        else if (x < 0.86) s = S.endSession(s)
        else if (x < 0.92) s = S.remixNext(s)
        rules(s, where)
        // a team's two players are always together: both on a court, or both off
        for (const t of s.teams) { const on = t.playerIds.map((id) => s.courts.some((c) => c.match && [...c.match.a, ...c.match.b].includes(id))); if (s.players.filter((p) => t.playerIds.includes(p.id)).every((p) => p.status === 'active')) expect(on[0], `${where}: team ${t.name} is split across on/off court`).toBe(on[1]) }
      }
    }
  })
})
