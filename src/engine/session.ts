import {
  DEFAULT_CONFIG, type Config, type Court, type CourtTag, type Live, type Match, type Player, type Session, type Team,
} from './types'
import { busyIds, matchSig, previewQueue, proposeChallengers, proposeMatch, unitsNeeded, waitingUnits } from './queue'
import { countMatches, gamesOf, medianGames } from './stats'

/** Games a player can miss on a break before the fairness catch-up starts. */
export const BREAK_GRACE = 2
export const MIN_LEVEL = 2
export const MAX_LEVEL = 5.5

const clone = <T,>(x: T): T => structuredClone(x)
const norm = (n: string) => n.trim().replace(/\s+/g, ' ')
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function nameTaken(s: Session, name: string, exceptId?: string): boolean {
  return s.players.some((p) => p.id !== exceptId && same(p.name, norm(name)))
}

function newId(s: Session, prefix: string): string {
  return `${prefix}${s.nextId++}`
}

function addPlayerRaw(s: Session, name: string, level: number): Player {
  const p: Player = {
    id: newId(s, 'p'),
    name: norm(name),
    level: Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level)),
    status: 'active',
    baseGames: 0,
    lastPlayed: s.seq,
    intervals: [[s.seq, null]],
  }
  s.players.push(p)
  return p
}

function makeCourt(s: Session, n: number): Court {
  return { id: newId(s, 'c'), name: `Court ${n}`, match: null, hold: null }
}

export interface NewPlayer {
  name: string
  level?: number
}

export function createSession(
  name: string,
  config: Partial<Config>,
  players: NewPlayer[],
  pairs: [NewPlayer, NewPlayer][] = [],
): Session {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const s: Session = {
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: norm(name) || 'Open play',
    createdAt: Date.now(),
    endedAt: null,
    config: cfg,
    players: [],
    teams: [],
    courts: [],
    matches: [],
    seq: 0,
    nextId: 1,
  }
  for (let i = 1; i <= cfg.courts; i++) s.courts.push(makeCourt(s, i))
  if (cfg.challengerCourt && cfg.mode !== 'winners') s.courts[0].tags = ['challenger']
  if (cfg.format === 'teams') {
    for (const [x, y] of pairs) addTeamRaw(s, x, y)
  } else {
    for (const p of players) if (norm(p.name) && !nameTaken(s, p.name)) addPlayerRaw(s, p.name, p.level ?? 3.5)
  }
  return fill(s)
}

function addTeamRaw(s: Session, x: NewPlayer, y: NewPlayer): Team | null {
  if (!norm(x.name) || !norm(y.name) || same(norm(x.name), norm(y.name))) return null
  if (nameTaken(s, x.name) || nameTaken(s, y.name)) return null
  const a = addPlayerRaw(s, x.name, x.level ?? 3.5)
  const b = addPlayerRaw(s, y.name, y.level ?? 3.5)
  const t: Team = { id: newId(s, 't'), name: `${a.name} & ${b.name}`, playerIds: [a.id, b.id] }
  s.teams.push(t)
  return t
}

/** True when winners stay on this court: the whole session is winners-stay, or this court is tagged Challenger. */
export function isKing(s: Session, c: Court): boolean {
  return s.config.mode === 'winners' || !!c.tags?.includes('challenger')
}

/** Show or hide a rule badge on a court. Tagging a court Challenger makes winners stay there; clearing it releases the holders. */
export function toggleCourtTag(s: Session, courtId: string, tag: CourtTag): Session {
  return mutate(s, (d) => {
    const c = d.courts.find((x) => x.id === courtId)
    if (!c) return
    const tags = new Set(c.tags ?? [])
    if (tags.has(tag)) tags.delete(tag)
    else tags.add(tag)
    c.tags = [...tags]
    if (tag === 'challenger' && !tags.has('challenger') && d.config.mode !== 'winners') c.hold = null
  })
}

/** Start matches on every free court that can be filled. Safe to call after any change. */
export function fill(input: Session): Session {
  const s = input
  if (s.endedAt) return s
  const counts = countMatches(s.matches)
  let started = false
  for (const court of s.courts) {
    if (court.match) continue
    const exclude = busyIds(s)
    if (court.hold) {
      const ch = proposeChallengers(s, exclude, counts)
      if (!ch) continue
      court.match = { a: court.hold.ids, b: ch, startedAt: Date.now(), streak: court.hold.streak }
      court.hold = null
      clearPrio(s, ch)
      started = true
    } else {
      const m = proposeMatch(s, exclude, counts)
      if (!m) continue
      court.match = { a: m.a, b: m.b, startedAt: Date.now(), streak: 0 }
      clearPrio(s, [...m.a, ...m.b])
      started = true
    }
  }
  if (started) {
    s.fresh = false // the remix has been used up; later matches go back to strict fairness
    expireBackPrio(s)
  }
  return s
}

const MAX_TRIES = 30

/**
 * Host remix of the upcoming matches. Re-draws the next match-up (new partners / opponents) and clears any
 * manual "play next" / "send to back" overrides. Games already on court are untouched.
 * Returns the same session object when no different match-up is possible.
 */
export function remixNext(s: Session): Session {
  const d = clone(s)
  const before = previewQueue(d, 1)[0]
  const oldSig = before ? matchSig(before.a, before.b) : ''
  const hadPrio = d.players.some((p) => p.prio)
  for (const p of d.players) { delete p.prio; delete p.prioAt }
  d.fresh = true
  let changed = false
  for (let i = 0; i < MAX_TRIES; i++) {
    d.remix = (d.remix ?? 0) + 1
    const n = previewQueue(d, 1)[0]
    if (!n) break
    if (matchSig(n.a, n.b) !== oldSig) { changed = true; break }
  }
  if (!changed && !hadPrio) return s
  return fill(d)
}

/**
 * Host remix of a game that is on a court right now: its players go back into the pool and a different
 * match-up is drawn. In winners-stay the holding side keeps the court and only the challengers are redrawn.
 * Returns the same session object when no different match-up is possible.
 */
export function remixCourt(s: Session, courtId: string): Session {
  const d = clone(s)
  const c = d.courts.find((x) => x.id === courtId)
  if (!c?.match) return s
  const old = c.match
  const oldSig = matchSig(old.a, old.b)
  const keep = isKing(d, c) && old.streak > 0 ? old.a : null
  c.match = null
  const exclude = busyIds(d)
  if (keep) keep.forEach((id) => exclude.add(id))
  d.fresh = true
  for (let i = 0; i < MAX_TRIES; i++) {
    d.remix = (d.remix ?? 0) + 1
    if (keep) {
      const ch = proposeChallengers(d, exclude)
      if (ch && matchSig(keep, ch) !== oldSig) {
        c.match = { a: keep, b: ch, startedAt: Date.now(), streak: old.streak }
        clearPrio(d, ch)
        break
      }
    } else {
      const m = proposeMatch(d, exclude)
      if (m && matchSig(m.a, m.b) !== oldSig) {
        c.match = { a: m.a, b: m.b, startedAt: Date.now(), streak: 0 }
        clearPrio(d, [...m.a, ...m.b])
        break
      }
    }
  }
  if (!c.match) return s // nothing different possible: leave the game as it was
  d.fresh = false
  return fill(d)
}

function mutate(s: Session, fn: (draft: Session) => void): Session {
  const d = clone(s)
  fn(d)
  return fill(d)
}

function courtOf(s: Session, playerId: string): Court | undefined {
  return s.courts.find((c) => c.match && [...c.match.a, ...c.match.b].includes(playerId))
}

function close(p: Player, seq: number) {
  const last = p.intervals[p.intervals.length - 1]
  if (last && last[1] === null) last[1] = seq
}

export function addPlayer(s: Session, name: string, level = 3.5): Session {
  if (!norm(name) || nameTaken(s, name)) return s
  return mutate(s, (d) => {
    const p = addPlayerRaw(d, name, level)
    if (d.config.lateJoinMedian) p.baseGames = medianGames(d, countMatches(d.matches), p.id)
  })
}

export function addTeam(s: Session, x: NewPlayer, y: NewPlayer): Session {
  return mutate(s, (d) => {
    const t = addTeamRaw(d, x, y)
    if (t && d.config.lateJoinMedian) {
      const med = medianGames(d, countMatches(d.matches), t.playerIds[0])
      for (const id of t.playerIds) d.players.find((p) => p.id === id)!.baseGames = med
    }
  })
}

export function renamePlayer(s: Session, id: string, name: string): Session {
  if (!norm(name) || nameTaken(s, name, id)) return s
  return mutate(s, (d) => {
    const p = d.players.find((x) => x.id === id)
    if (!p) return
    p.name = norm(name)
    for (const t of d.teams) {
      if (t.playerIds.includes(id)) t.name = t.playerIds.map((pid) => d.players.find((x) => x.id === pid)!.name).join(' & ')
    }
  })
}

export function setLevel(s: Session, id: string, level: number): Session {
  return mutate(s, (d) => {
    const p = d.players.find((x) => x.id === id)
    if (p) p.level = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level))
  })
}

/** Free a player from any court/hold: swap in the next waiting player, or send the rest back to the queue. */
function release(d: Session, id: string) {
  for (const c of d.courts) {
    if (c.hold?.ids.includes(id)) c.hold = null
  }
  const court = courtOf(d, id)
  if (!court || !court.match) return
  const m = court.match
  if (d.config.format !== 'teams') {
    const sub = waitingUnits(d).find((u) => !u.ids.includes(id))
    if (sub) {
      const swap = (ids: string[]) => ids.map((x) => (x === id ? sub.ids[0] : x))
      court.match = { ...m, a: swap(m.a), b: swap(m.b) }
      return
    }
  }
  court.match = null // not enough people to continue: the others go back to the queue
}

export function setStatus(s: Session, id: string, status: Player['status']): Session {
  return mutate(s, (d) => {
    const p = d.players.find((x) => x.id === id)
    if (!p || p.status === status) return
    const wasActive = p.status === 'active'
    if (wasActive) {
      p.status = status
      delete p.prio
      delete p.prioAt
      close(p, d.seq)
      release(d, id)
      if (d.config.format === 'teams') {
        // A fixed team cannot play short: take the partner out of any hold too.
        const t = d.teams.find((x) => x.playerIds.includes(id))
        if (t) for (const c of d.courts) if (c.hold && t.playerIds.some((pid) => c.hold!.ids.includes(pid))) c.hold = null
      }
    } else {
      p.status = status
      if (status === 'active') {
        p.intervals.push([d.seq, null])
        // A returning player keeps the place in line they had earned (lastPlayed and games are left alone).
        // Only a long absence gets a catch-up, so they cannot come back and take every court.
        if (d.config.lateJoinMedian) {
          const counts = countMatches(d.matches)
          const mine = gamesOf(p, counts)
          const behind = medianGames(d, counts, p.id) - mine
          if (behind > BREAK_GRACE) p.baseGames += behind - BREAK_GRACE
        }
      }
    }
  })
}

function clearPrio(d: Session, ids: string[]) {
  for (const p of d.players) {
    if (ids.includes(p.id)) { delete p.prio; delete p.prioAt }
  }
}

/** A match was just drawn: "send to back" requests lapse so nobody is buried for the rest of the night. */
function expireBackPrio(d: Session) {
  for (const p of d.players) {
    if (p.prio === 'back') { delete p.prio; delete p.prioAt }
  }
}

/** The players that move as one: a fixed team, or just the player. */
function unitIds(d: Session, id: string): string[] {
  if (d.config.format === 'teams') {
    const t = d.teams.find((x) => x.playerIds.includes(id))
    if (t) return [...t.playerIds]
  }
  return [id]
}

/** Pull a waiting player (or team) into a live court, replacing `outId` (or their team). `outId` goes back to the queue. */
export function substitute(s: Session, courtId: string, outId: string, inId: string): Session {
  return mutate(s, (d) => {
    const c = d.courts.find((x) => x.id === courtId)
    if (!c?.match) return
    const inIds = unitIds(d, inId)
    const busy = busyIds(d)
    const byId = new Map(d.players.map((p) => [p.id, p]))
    if (inIds.some((id) => busy.has(id) || byId.get(id)?.status !== 'active')) return
    const m = c.match
    const outIds = unitIds(d, outId)
    if (d.config.format === 'teams') {
      const side = m.a.includes(outId) ? 'a' : 'b'
      m[side] = inIds
    } else {
      const swap = (ids: string[]) => ids.map((x) => (x === outId ? inId : x))
      m.a = swap(m.a)
      m.b = swap(m.b)
    }
    clearPrio(d, [...inIds, ...outIds])
    for (const p of d.players) if (outIds.includes(p.id)) p.lastPlayed = d.seq
  })
}

/** Pull a player off a live court; the next person in line takes their place. No-op if nobody is waiting. */
export function pullOut(s: Session, id: string): Session {
  const court = courtOf(s, id)
  const sub = waitingUnits(s).find((u) => !u.ids.includes(id))
  if (!court || !sub) return s
  return substitute(s, court.id, id, sub.ids[0])
}

function setPrio(s: Session, id: string, prio: 'front' | 'back' | null): Session {
  return mutate(s, (d) => {
    const ids = unitIds(d, id)
    const at = d.nextId++
    for (const p of d.players) {
      if (!ids.includes(p.id)) continue
      if (prio) { p.prio = prio; p.prioAt = at } else { delete p.prio; delete p.prioAt }
    }
  })
}

/** Move a waiting player (or team) to the front of the line. */
export const playNext = (s: Session, id: string) => setPrio(s, id, 'front')
/** Move a waiting player (or team) behind everyone else. */
export const sendBack = (s: Session, id: string) => setPrio(s, id, 'back')
export const clearPriority = (s: Session, id: string) => setPrio(s, id, null)

/** Abandon the game on a court without recording it; everyone returns to the queue. */
export function cancelMatch(s: Session, courtId: string): Session {
  return mutate(s, (d) => {
    const c = d.courts.find((x) => x.id === courtId)
    if (!c?.match) return
    const ids = [...c.match.a, ...c.match.b]
    c.match = null
    c.hold = null
    for (const p of d.players) if (ids.includes(p.id)) p.lastPlayed = d.seq
  })
}

export interface Result {
  winner: 'a' | 'b' | null
  scoreA: number | null
  scoreB: number | null
}

export function finishMatch(s: Session, courtId: string, r: Result): Session {
  return mutate(s, (d) => {
    const c = d.courts.find((x) => x.id === courtId)
    if (!c?.match) return
    const live: Live = c.match
    d.seq += 1
    const rec: Match = {
      id: newId(d, 'm'), seq: d.seq, court: c.name, a: live.a, b: live.b,
      scoreA: r.scoreA, scoreB: r.scoreB, winner: r.winner, at: Date.now(),
      ms: Math.max(0, Date.now() - live.startedAt),
    }
    d.matches.push(rec)
    c.match = null
    for (const p of d.players) if ([...live.a, ...live.b].includes(p.id)) p.lastPlayed = d.seq
    if (isKing(d, c) && r.winner) {
      const streak = (r.winner === 'a' ? live.streak : 0) + 1
      rec.streak = streak
      if (streak < d.config.maxStreak) c.hold = { ids: r.winner === 'a' ? live.a : live.b, streak }
    }
  })
}

export function editMatch(s: Session, id: string, r: Result): Session {
  return mutate(s, (d) => {
    const m = d.matches.find((x) => x.id === id)
    if (m) Object.assign(m, r)
  })
}

export function deleteMatch(s: Session, id: string): Session {
  return mutate(s, (d) => {
    d.matches = d.matches.filter((m) => m.id !== id)
  })
}

export function setCourts(s: Session, count: number): Session {
  return mutate(s, (d) => {
    const n = Math.max(1, Math.min(12, count))
    while (d.courts.length < n) d.courts.push(makeCourt(d, d.courts.length + 1))
    // Only remove empty courts, from the end, so no live game is lost.
    while (d.courts.length > n) {
      const last = d.courts[d.courts.length - 1]
      if (last.match) break
      d.courts.pop()
    }
    d.config.courts = d.courts.length
  })
}

export function setConfig(s: Session, patch: Partial<Config>): Session {
  return mutate(s, (d) => {
    // Format is fixed once play starts (use setMode for the queue mode); only game rules change here.
    const { target, winBy2, cap, maxStreak, lateJoinMedian } = { ...d.config, ...patch }
    Object.assign(d.config, { target, winBy2, cap, maxStreak, lateJoinMedian })
  })
}

export function setMode(s: Session, mode: Config['mode']): Session {
  return mutate(s, (d) => {
    d.config.mode = mode
    for (const c of d.courts) c.hold = null
  })
}

/** Take the next player in line out of the upcoming match: one tap. They go to the back; the next in line steps up. */
export function swapOutOfNext(s: Session, id: string): Session {
  const waiting = waitingUnits(s)
  if (waiting.length <= unitsNeeded(s.config.format)) return s // nobody extra to bring in
  return sendBack(s, id)
}

/** Re-open a session that was ended by mistake. */
export function reopenSession(s: Session): Session {
  const d = clone(s)
  d.endedAt = null
  for (const p of d.players) {
    const last = p.intervals[p.intervals.length - 1]
    if (p.status === 'active' && last && last[1] !== null) p.intervals.push([last[1], null])
  }
  return fill(d)
}

export function endSession(s: Session): Session {
  const d = clone(s)
  d.endedAt = Date.now()
  for (const c of d.courts) { c.match = null; c.hold = null }
  for (const p of d.players) close(p, d.seq)
  return d
}

export function sessionReady(cfg: Config, playerCount: number, pairCount: number): string | null {
  const units = cfg.format === 'teams' ? pairCount : playerCount
  const need = unitsNeeded(cfg.format)
  if (units < need) {
    return cfg.format === 'teams' ? `Add at least ${need} teams` : `Add at least ${need} players`
  }
  return null
}

export function waitingCount(s: Session): number {
  return waitingUnits(s).reduce((n, u) => n + u.ids.length, 0)
}

export { gamesOf }
