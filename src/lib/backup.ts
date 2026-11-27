import { COURT_TAGS, type Session } from '../engine/types'
import type { RosterEntry } from '../store'

/** What a backup file contains. `app` + `version` let us reject files that are not ours and migrate later. */
export interface Backup {
  app: 'paddl'
  version: 1
  exportedAt: number
  sessions: Session[]
  roster: RosterEntry[]
}

export type ParseResult = { ok: true; backup: Backup; warnings: string[] } | { ok: false; error: string }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string'
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const ids = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr)

export function makeBackup(sessions: Session[], roster: RosterEntry[], now = Date.now()): Backup {
  return { app: 'paddl', version: 1, exportedAt: now, sessions, roster }
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `paddl-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`
}

/**
 * Is this a session the app can safely load? Checks the structure the screens rely on, so a damaged or
 * hand-edited file cannot crash the app later. Returns a reason when it is not.
 */
export function sessionProblem(s: unknown): string | null {
  if (!isObj(s)) return 'not an object'
  if (!isStr(s.id) || !s.id) return 'missing id'
  if (!isStr(s.name)) return 'missing name'
  if (!isNum(s.createdAt)) return 'missing start time'
  if (s.endedAt !== null && !isNum(s.endedAt)) return 'bad end time'
  if (!isObj(s.config)) return 'missing settings'
  const c = s.config
  if (!['doubles', 'singles', 'teams'].includes(c.format as string)) return 'unknown format'
  if (!['fair', 'winners', 'skill', 'robin', 'mystery'].includes(c.mode as string)) return 'unknown mode'
  if (!isNum(c.target) || !isNum(c.maxStreak)) return 'bad game rules'
  if (!Array.isArray(s.players) || !Array.isArray(s.courts) || !Array.isArray(s.matches) || !Array.isArray(s.teams)) return 'missing lists'
  if (!isNum(s.seq) || !isNum(s.nextId)) return 'missing counters'

  const known = new Set<string>()
  for (const p of s.players as unknown[]) {
    if (!isObj(p) || !isStr(p.id) || !isStr(p.name) || !isNum(p.level) || !['active', 'resting', 'left'].includes(p.status as string)) return 'a player is malformed'
    if (!isNum(p.baseGames) || !isNum(p.lastPlayed) || !Array.isArray(p.intervals)) return 'a player is malformed'
    if (p.joinedAt !== undefined && !isNum(p.joinedAt)) return 'a player has a bad join time' // optional, but a bad one would show as "NaN min"
    // The stats screens destructure every interval as [from, to]; one bad entry crashed Standings.
    if (!(p.intervals as unknown[]).every((iv) => Array.isArray(iv) && iv.length === 2 && isNum(iv[0]) && (iv[1] === null || isNum(iv[1])))) return 'a player has a bad time range'
    known.add(p.id)
  }
  for (const c of s.courts as unknown[]) {
    if (!isObj(c) || !isStr(c.id) || !isStr(c.name)) return 'a court is malformed'
    const m = c.match
    if (m !== null && (!isObj(m) || !ids(m.a) || !ids(m.b) || !isNum(m.startedAt) || !isNum(m.streak))) return 'a live game is malformed'
    if (isObj(m) && ![...(m.a as string[]), ...(m.b as string[])].every((id) => known.has(id))) return 'a live game names an unknown player'
    // A winners-stay hold and the court's badges are read on every render. Older saves have neither, so both are optional.
    if (c.hold !== undefined && c.hold !== null) {
      if (!isObj(c.hold) || !ids(c.hold.ids) || !isNum(c.hold.streak)) return 'a court hold is malformed'
      if (!(c.hold.ids as string[]).every((id) => known.has(id))) return 'a court hold names an unknown player'
    }
    if (c.tags !== undefined && (!Array.isArray(c.tags) || !c.tags.every((x) => isStr(x) && Object.prototype.hasOwnProperty.call(COURT_TAGS, x)))) return 'a court has unknown badges'
  }
  for (const m of s.matches as unknown[]) {
    if (!isObj(m) || !isStr(m.id) || !isNum(m.seq) || !ids(m.a) || !ids(m.b) || !isNum(m.at)) return 'a game is malformed'
    if (m.winner !== null && m.winner !== 'a' && m.winner !== 'b') return 'a game has a bad result'
    if (![...(m.a as string[]), ...(m.b as string[])].every((id) => known.has(id))) return 'a game names an unknown player'
  }
  for (const t of s.teams as unknown[]) {
    if (!isObj(t) || !isStr(t.id) || !ids(t.playerIds) || (t.playerIds as string[]).length !== 2) return 'a team is malformed'
  }
  return null
}

/** Read and validate a backup file's text. Never throws; bad sessions are skipped with a warning, a bad file is rejected. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not a Paddl backup (it could not be read).' }
  }
  if (!isObj(raw) || raw.app !== 'paddl') return { ok: false, error: 'That file is not a Paddl backup.' }
  if (raw.version !== 1) return { ok: false, error: 'That backup is from a newer version of Paddl. Update the app and try again.' }
  if (!Array.isArray(raw.sessions)) return { ok: false, error: 'That backup has no sessions in it.' }

  const warnings: string[] = []
  const sessions: Session[] = []
  const seen = new Set<string>()
  for (const s of raw.sessions) {
    const problem = sessionProblem(s)
    const label = isObj(s) && isStr(s.name) ? `"${s.name}"` : 'a session'
    if (problem) { warnings.push(`Skipped ${label}: ${problem}.`); continue }
    const sess = s as Session
    if (seen.has(sess.id)) { warnings.push(`Skipped a duplicate of ${label}.`); continue }
    seen.add(sess.id)
    sessions.push(sess)
  }

  const roster: RosterEntry[] = []
  if (Array.isArray(raw.roster)) {
    for (const r of raw.roster) if (isObj(r) && isStr(r.name) && r.name.trim() && isNum(r.level)) roster.push({ name: r.name, level: r.level })
  }
  if (!sessions.length && !roster.length) return { ok: false, error: warnings[0] ?? 'That backup is empty.' }
  return { ok: true, backup: { app: 'paddl', version: 1, exportedAt: isNum(raw.exportedAt) ? raw.exportedAt : Date.now(), sessions, roster }, warnings }
}

export interface MergeResult {
  sessions: Session[]
  roster: RosterEntry[]
  added: number // sessions that were new
  updated: number // sessions replaced because the backup copy had more games
  kept: number // sessions kept as they were because they were newer or equal
}

/**
 * Combine a backup into what is on the device without losing either side. A session that exists in both is kept in
 * whichever version has more finished games (the one that progressed further); ties keep the device copy.
 */
export function mergeBackup(cur: { sessions: Session[]; roster: RosterEntry[] }, b: Backup): MergeResult {
  const byId = new Map(cur.sessions.map((s) => [s.id, s]))
  let added = 0
  let updated = 0
  let kept = 0
  for (const s of b.sessions) {
    const mine = byId.get(s.id)
    if (!mine) { byId.set(s.id, s); added++ } else if (s.matches.length > mine.matches.length || (!mine.endedAt && s.endedAt)) { byId.set(s.id, s); updated++ } else kept++
  }
  const sessions = [...byId.values()].sort((x, y) => y.createdAt - x.createdAt)

  const seen = new Map(cur.roster.map((r) => [r.name.toLowerCase(), r]))
  for (const r of b.roster) if (!seen.has(r.name.toLowerCase())) seen.set(r.name.toLowerCase(), r)
  return { sessions, roster: [...seen.values()].slice(0, 200), added, updated, kept }
}
