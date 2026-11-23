import { describe, expect, it } from 'vitest'
import * as S from './session'
import { awards } from './insights'
import { busyIds, previewQueue, waitingUnits } from './queue'
import { playerStandings, standings, summarize } from './stats'
import { parseBackup, makeBackup, sessionProblem } from '../lib/backup'
import { resultsCsv } from '../lib/csv'
import type { Config, Session } from './types'

/** Small deterministic random generator, so any failure can be replayed from its seed. */
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

/** Every rule that must hold no matter what the host does. Returns the first broken rule, or null. */
function broken(s: Session): string | null {
  const known = new Set(s.players.map((p) => p.id))
  const seen = new Map<string, string>()
  for (const c of s.courts) {
    if (c.match) {
      const ids = [...c.match.a, ...c.match.b]
      if (ids.length !== new Set(ids).size) return `${c.name}: a player appears twice in one game`
      for (const id of ids) {
        if (!known.has(id)) return `${c.name}: unknown player ${id}`
        if (seen.has(id)) return `player ${id} is on ${seen.get(id)} and ${c.name}`
        seen.set(id, c.name)
        const p = s.players.find((x) => x.id === id)!
        if (p.status !== 'active') return `${p.name} is ${p.status} but is on ${c.name}`
      }
      const need = s.config.format === 'doubles' ? 2 : s.config.format === 'singles' ? 1 : 2
      if (c.match.a.length !== need || c.match.b.length !== need) return `${c.name}: wrong team size ${c.match.a.length}v${c.match.b.length}`
    }
    if (c.hold) for (const id of c.hold.ids) if (seen.has(id) && c.match) return `holder ${id} is also playing on ${c.name}`
  }
  const names = s.courts.map((c) => c.name)
  if (new Set(names).size !== names.length) return `duplicate court names: ${names.join(', ')}`
  if (s.courts.length < 1) return 'no courts'
  if (s.config.courts !== s.courts.length) return 'court count out of sync'
  const ids = s.players.map((p) => p.id)
  if (new Set(ids).size !== ids.length) return 'duplicate player ids'
  const lower = s.players.filter((p) => p.status !== 'left').map((p) => p.name.toLowerCase())
  if (new Set(lower).size !== lower.length) return 'two players share a name'
  // The waiting line never contains someone who is on court or not active.
  const busy = busyIds(s)
  for (const u of waitingUnits(s)) for (const id of u.ids) {
    if (busy.has(id)) return `waiting line contains ${id}, who is busy`
    if (s.players.find((p) => p.id === id)!.status !== 'active') return `waiting line contains inactive ${id}`
  }
  // A free court should never sit empty while a full match could be made from the line.
  const need = s.config.format === 'doubles' ? 4 : 2
  const free = s.courts.some((c) => !c.match && !c.hold)
  if (free && !s.endedAt && s.config.format !== 'teams') {
    const avail = waitingUnits(s).length
    if (s.config.mode !== 'winners' && avail >= need) return `a court is idle with ${avail} players waiting`
  }
  for (const m of s.matches) {
    for (const id of [...m.a, ...m.b]) if (!known.has(id)) return `game ${m.seq} names an unknown player`
    if (m.winner && (m.scoreA !== null || m.scoreB !== null)) {
      const w = m.winner === 'a' ? m.scoreA! : m.scoreB!
      const l = m.winner === 'a' ? m.scoreB! : m.scoreA!
      if (w <= l) return `game ${m.seq}: winner has the lower score`
    }
  }
  const stats = playerStandings(s)
  for (const r of stats) {
    if (![r.played, r.wins, r.losses, r.pf, r.pa, r.playMs].every(Number.isFinite)) return `NaN in the stats for ${r.name}`
    if (r.wins + r.losses > r.played) return `${r.name}: more results than games`
  }
  if (sessionProblem(JSON.parse(JSON.stringify(s)))) return `session fails validation: ${sessionProblem(JSON.parse(JSON.stringify(s)))}`
  // Everything the screens call must not throw.
  standings(s); summarize(s); awards(s); previewQueue(s, 4); resultsCsv(s)
  return null
}

const NAMES = ['Ana', 'Ben', 'Cara', 'Dan', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivy', 'Jo', 'Kai', 'Lia', 'Mo', 'Ned', 'Oz', 'Pia', 'Quin', 'Rae', 'Sol', 'Tia']

function start(r: () => number, cfg: Partial<Config>): Session {
  const n = 4 + Math.floor(r() * 14)
  if (cfg.format === 'teams') {
    const pairs = Array.from({ length: 3 + Math.floor(r() * 4) }, (_, i) => [{ name: `T${i}a` }, { name: `T${i}b` }] as [{ name: string }, { name: string }])
    return S.createSession('stress', { courts: 1 + Math.floor(r() * 3), ...cfg }, [], pairs)
  }
  return S.createSession('stress', { courts: 1 + Math.floor(r() * 4), ...cfg }, NAMES.slice(0, n).map((name) => ({ name, level: 2 + Math.floor(r() * 7) * 0.5 })))
}

/** One random thing a host might do. Several are deliberately abusive (double taps, impossible requests). */
function act(s: Session, r: () => number, log: string[]): Session {
  const pick = <T,>(a: T[]): T | undefined => a[Math.floor(r() * a.length)]
  const live = s.courts.filter((c) => c.match)
  const x = r()
  const player = pick(s.players)
  if (x < 0.3 && live.length) {
    const c = pick(live)!
    const w = r() < 0.5 ? 'a' : 'b'
    log.push(`win ${c.name} ${w}`)
    const scored = r() < 0.5 // the app records either a full score or none, never half of one
    return S.finishMatch(s, c.id, { winner: w, scoreA: scored ? (w === 'a' ? 11 : 6) : null, scoreB: scored ? (w === 'a' ? 6 : 11) : null })
  }
  if (x < 0.36 && live.length) { const c = pick(live)!; log.push(`no contest ${c.name}`); return S.finishMatch(s, c.id, { winner: null, scoreA: null, scoreB: null }) }
  if (x < 0.41 && live.length) { const c = pick(live)!; log.push(`cancel ${c.name}`); return S.cancelMatch(s, c.id) }
  if (x < 0.5 && player) { const st = pick(['resting', 'active', 'left'] as const)!; log.push(`${player.name} -> ${st}`); return S.setStatus(s, player.id, st) }
  if (x < 0.55) { const nm = r() < 0.2 && player ? player.name : `New${Math.floor(r() * 9999)}`; log.push(`add ${nm}`); return s.config.format === 'teams' ? S.addTeam(s, { name: nm }, { name: nm + 'x' }) : S.addPlayer(s, nm) }
  if (x < 0.6) { log.push('add court'); return S.addCourt(s) }
  if (x < 0.66 && s.courts.length) { const c = pick(s.courts)!; log.push(`remove ${c.name}`); return S.removeCourt(s, c.id) }
  if (x < 0.72 && live.length) { const c = pick(live)!; log.push(`remix ${c.name}`); return S.remixCourt(s, c.id) }
  if (x < 0.76) { log.push('remix next'); return S.remixNext(s) }
  if (x < 0.82 && live.length && player) { const c = pick(live)!; const out = pick([...c.match!.a, ...c.match!.b])!; log.push(`pull in ${player.name} for ${out} on ${c.name}`); return S.substitute(s, c.id, out, player.id) }
  if (x < 0.86 && live.length) { const p = pick([...live[0].match!.a])!; log.push(`pull out ${p}`); return S.pullOut(s, p) }
  if (x < 0.9 && player) { log.push(`play next ${player.name}`); return S.playNext(s, player.id) }
  if (x < 0.93 && player) { log.push(`send back ${player.name}`); return S.sendBack(s, player.id) }
  if (x < 0.95 && s.matches.length) { const m = pick(s.matches)!; log.push(`edit game ${m.seq}`); return S.editMatch(s, m.id, { winner: m.winner === 'a' ? 'b' : 'a', scoreA: null, scoreB: null }) }
  if (x < 0.97 && s.matches.length) { const m = pick(s.matches)!; log.push(`delete game ${m.seq}`); return S.deleteMatch(s, m.id) }
  if (x < 0.985 && s.courts.length) { const c = pick(s.courts)!; log.push(`toggle challenger ${c.name}`); return S.toggleCourtTag(s, c.id, 'challenger') }
  if (player && s.config.format !== 'teams') { log.push(`swap out of next ${player.name}`); return S.swapOutOfNext(s, player.id) }
  return s
}

describe('stress: random hosts doing random (and abusive) things', () => {
  const configs: Partial<Config>[] = [
    { mode: 'fair' }, { mode: 'winners', maxStreak: 2 }, { mode: 'skill' }, { mode: 'robin' }, { mode: 'mystery' },
    { format: 'singles' }, { format: 'teams' }, { mode: 'fair', challengerCourt: true, courts: 3 },
    { mode: 'winners', winnersSplit: true, maxStreak: 2 },
    { mode: 'fair', challengerCourt: true, winnersSplit: true, courts: 3 },
    { mode: 'fair', breakReturn: 'back' },
    { mode: 'skill', breakReturn: 'back' },
  ]
  configs.forEach((cfg, ci) => {
    it(`config ${ci} (${cfg.format ?? 'doubles'}/${cfg.mode ?? 'fair'}): 60 sessions x 120 actions never break an invariant`, () => {
      for (let seed = 1; seed <= 60; seed++) {
        const r = rng(seed * 7919 + ci)
        let s = start(r, cfg)
        const log: string[] = []
        expect(broken(s), `seed ${seed} at start`).toBeNull()
        for (let i = 0; i < 120; i++) {
          const before = s
          let next: Session
          try { next = act(s, r, log) } catch (e) { throw new Error(`seed ${seed} step ${i} threw: ${(e as Error).message}\n${log.slice(-6).join('\n')}`) }
          s = next
          const why = broken(s)
          if (why) throw new Error(`seed ${seed} step ${i}: ${why}\nlast actions:\n${log.slice(-8).join('\n')}`)
          expect(before === s || before !== s).toBe(true)
        }
      }
    })
  })

  it('ending, reopening and ending again keeps everything consistent', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed)
      let s = start(r, { mode: 'fair' })
      const log: string[] = []
      for (let i = 0; i < 40; i++) s = act(s, r, log)
      s = S.endSession(s)
      expect(broken(s), `ended seed ${seed}`).toBeNull()
      s = S.reopenSession(s)
      expect(broken(s), `reopened seed ${seed}`).toBeNull()
      for (let i = 0; i < 20; i++) s = act(s, r, log)
      expect(broken(S.endSession(s)), `ended again seed ${seed}`).toBeNull()
    }
  })

  it('every session survives a backup file round trip', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed + 500)
      let s = start(r, configs[seed % configs.length])
      const log: string[] = []
      for (let i = 0; i < 80; i++) s = act(s, r, log)
      const parsed = parseBackup(JSON.stringify(makeBackup([s], [])))
      expect(parsed.ok, `seed ${seed}: ${!parsed.ok ? parsed.error : ''}`).toBe(true)
      if (parsed.ok) expect(parsed.warnings).toEqual([])
    }
  })

  it('fairness holds under chaos: nobody who stays all night is left far behind', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const r = rng(seed * 31)
      let s = S.createSession('fair', { courts: 2 }, NAMES.slice(0, 12).map((name) => ({ name })))
      for (let i = 0; i < 80; i++) {
        const liveCourts = s.courts.filter((x) => x.match)
        if (!liveCourts.length) break
        const c = liveCourts[Math.floor(r() * liveCourts.length)]
        s = S.finishMatch(s, c.id, { winner: r() < 0.5 ? 'a' : 'b', scoreA: null, scoreB: null })
        if (r() < 0.15) s = S.remixNext(s)
        if (r() < 0.1) s = S.sendBack(s, s.players[Math.floor(r() * s.players.length)].id)
      }
      const g = playerStandings(s).map((p) => p.played)
      expect(Math.max(...g) - Math.min(...g), `seed ${seed}`).toBeLessThanOrEqual(4)
    }
  })

  it('a big crowd does not slow the engine to a crawl', () => {
    const t = Date.now()
    let s = S.createSession('big', { courts: 6, mode: 'skill' }, Array.from({ length: 60 }, (_, i) => ({ name: `Player ${i}`, level: 2 + (i % 7) * 0.5 })))
    for (let i = 0; i < 200; i++) {
      const c = s.courts.find((x) => x.match)
      if (!c) break
      s = S.finishMatch(s, c.id, { winner: i % 2 ? 'a' : 'b', scoreA: null, scoreB: null })
    }
    expect(Date.now() - t).toBeLessThan(15000)
    expect(broken(s)).toBeNull()
  })
})
