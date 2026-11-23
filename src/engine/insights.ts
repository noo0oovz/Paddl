import type { Match, Session } from './types'
import { pairKey, playerStandings, standings, type PlayerStat } from './stats'
import { previewQueue } from './queue'
import { nameOf } from './stats'

/* ---------------------------------------------------------------------------------------------
 * Queue ETA
 * ------------------------------------------------------------------------------------------- */

/** Typical game length in ms, from finished games (falls back to 12 min before enough data exists). */
export function avgGameMs(s: Session): number {
  const d = s.matches.map((m) => m.ms ?? 0).filter((ms) => ms >= 60_000)
  if (d.length < 2) return 12 * 60_000
  const recent = d.slice(-10).sort((a, b) => a - b)
  return recent[Math.floor(recent.length / 2)] // median: one marathon game should not skew it
}

export interface Eta {
  games: number // how many court-turns until this player is on
  ms: number // rough minutes until then
}

/**
 * Rough wait for each waiting player: how many games must finish before they get a court.
 * The courts free up on average every (game length / courts), so the Nth upcoming match starts after
 * roughly N * length / courts. Courts already running count their remaining time.
 */
export function queueEta(s: Session, now = Date.now()): Map<string, Eta> {
  const out = new Map<string, Eta>()
  const courts = Math.max(1, s.courts.length)
  const len = avgGameMs(s)
  const remaining = s.courts
    .filter((c) => c.match)
    // A game running past its usual length is probably close to the end, but never promise "in 1 minute":
    // assume at least a quarter of a game (and 2 minutes) is still left.
    .map((c) => Math.max(len * 0.25, 2 * 60_000, len - (now - c.match!.startedAt)))
    .sort((a, b) => a - b)
  const free = s.courts.filter((c) => !c.match).length
  const upcoming = previewQueue(s, 6)
  upcoming.forEach((m, i) => {
    // The first `free` matches start immediately; later ones wait for a running court to finish, then cycle.
    const slot = i - free
    let ms = 0
    if (slot >= 0) {
      const round = Math.floor(slot / courts)
      const idx = slot % Math.max(1, remaining.length || courts)
      ms = (remaining[idx] ?? len) + round * len
    }
    const games = slot < 0 ? 0 : Math.floor(slot / courts) + 1
    for (const id of [...m.a, ...(m.b ?? [])]) out.set(id, { games, ms })
  })
  return out
}

export function etaText(e: Eta | undefined): string | null {
  if (!e) return null
  if (e.games === 0 && e.ms === 0) return 'up now'
  const mins = Math.max(1, Math.round(e.ms / 60000))
  const g = e.games <= 1 ? 'next game' : `~${e.games} games`
  return `${g} (~${mins} min)`
}

/* ---------------------------------------------------------------------------------------------
 * Rivalry / nemesis
 * ------------------------------------------------------------------------------------------- */

export interface Rivalry {
  text: string
  kind: 'rematch' | 'record'
}

/** Series record of side `a` of a pairing against side `b`, counting every earlier game with the same two teams. */
function headToHead(matches: Match[], a: string[], b: string[]): { w: number; l: number } {
  const ka = [...a].sort().join('+')
  const kb = [...b].sort().join('+')
  let w = 0
  let l = 0
  for (const m of matches) {
    if (!m.winner) continue
    const ma = [...m.a].sort().join('+')
    const mb = [...m.b].sort().join('+')
    if (ma === ka && mb === kb) m.winner === 'a' ? w++ : l++
    else if (ma === kb && mb === ka) m.winner === 'a' ? l++ : w++
  }
  return { w, l }
}

/** Fun callouts for a match-up about to be (or being) played, based on the earlier games tonight. */
export function rivalryFor(s: Session, a: string[], b: string[]): Rivalry | null {
  const h = headToHead(s.matches, a, b)
  const nameA = a.map((id) => nameOf(s, id)).join(' & ')
  const nameB = b.map((id) => nameOf(s, id)).join(' & ')
  if (h.w + h.l >= 1) {
    const lead = h.w === h.l ? `tied ${h.w}–${h.l}` : h.w > h.l ? `${nameA} lead ${h.w}–${h.l}` : `${nameB} lead ${h.l}–${h.w}`
    return { kind: 'rematch', text: `Rematch alert: ${lead} tonight` }
  }
  // Singles (or fixed teams are covered above): nemesis on an individual level.
  if (a.length === 1 && b.length === 1) return null
  // Doubles with new teams: spot a player who keeps beating one of the opponents.
  let best: { text: string; gap: number } | null = null
  for (const x of a) for (const y of b) {
    let w = 0
    let l = 0
    for (const m of s.matches) {
      if (!m.winner) continue
      const inA = m.a.includes(x)
      const inB = m.b.includes(x)
      if (!(inA || inB)) continue
      const against = inA ? m.b.includes(y) : m.a.includes(y)
      if (!against) continue
      const won = (inA && m.winner === 'a') || (inB && m.winner === 'b')
      won ? w++ : l++
    }
    const gap = Math.abs(w - l)
    if (w + l >= 3 && gap >= 2 && (!best || gap > best.gap)) {
      best = { gap, text: `${nameOf(s, w > l ? x : y)} is ${Math.max(w, l)}–${Math.min(w, l)} against ${nameOf(s, w > l ? y : x)} tonight` }
    }
  }
  return best ? { kind: 'record', text: best.text } : null
}

/* ---------------------------------------------------------------------------------------------
 * Streak announcements
 * ------------------------------------------------------------------------------------------- */

/** "3-game win streak on Court 2!" for the court's current winners, or null below 2 in a row. */
export function streakCall(s: Session, courtId: string): string | null {
  const c = s.courts.find((x) => x.id === courtId)
  const streak = c?.match?.streak ?? 0
  if (!c?.match || streak < 2) return null
  const names = c.match.a.map((id) => nameOf(s, id)).join(' & ')
  return `${streak}-game win streak on ${c.name}: ${names}!`
}

/* ---------------------------------------------------------------------------------------------
 * Session awards
 * ------------------------------------------------------------------------------------------- */

export interface Award {
  id: string
  emoji: string
  title: string
  winner: string // player or duo name(s); every tied name is listed
  detail: string // the stat behind it, in plain words (starts with "3-way tie" when shared)
  tied?: number // how many share the award (only set when more than one)
}

/** A game is "close" when the winner won by 2 or less and the score reached the target. */
function isClose(m: Match): boolean {
  return m.scoreA !== null && m.scoreB !== null && !!m.winner && Math.abs(m.scoreA - m.scoreB) <= 2
}

/** Distinct partners + opponents a player met over the session. */
function variety(s: Session, id: string): { partners: number; opponents: number } {
  const partners = new Set<string>()
  const opponents = new Set<string>()
  for (const m of s.matches) {
    const mine = m.a.includes(id) ? m.a : m.b.includes(id) ? m.b : null
    if (!mine) continue
    const other = mine === m.a ? m.b : m.a
    mine.filter((x) => x !== id).forEach((x) => partners.add(x))
    other.forEach((x) => opponents.add(x))
  }
  return { partners: partners.size, opponents: opponents.size }
}

function fmtMin(ms: number): string {
  const m = Math.round(ms / 60000)
  return m < 60 ? `${Math.max(m, 1)} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

/** "Ana", "Ana & Ben", "Ana, Ben & Cara": every name, nothing hidden behind a "+2". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/**
 * Turn the people who share an award into its winner text, detail and tie count. Returns null when the tie is so
 * wide it means nothing (more than half of everyone shares it), so the award is skipped.
 */
function shared(names: string[], field: number, detail: string): { winner: string; detail: string; tied?: number } | null {
  if (names.length > 1 && names.length > field / 2 && field >= 4) return null
  return {
    winner: listNames(names),
    detail: names.length > 1 ? `${names.length}-way tie · ${detail}` : detail,
    ...(names.length > 1 ? { tied: names.length } : {}),
  }
}

/**
 * Playful end-of-session superlatives. Only awards that have real data behind them are returned,
 * and ties are named together instead of picking one arbitrarily.
 */
export function awards(s: Session): Award[] {
  const teams = s.config.format === 'teams' && s.teams.length > 0
  // In Fixed teams the team is the unit that plays and wins, so rank and name teams. Otherwise rank players.
  const rows = standings(s)
  const players = playerStandings(s)
  const out: Award[] = []
  if (s.matches.length === 0) return out

  const byId = new Map<string, PlayerStat>(players.map((r) => [r.id, r]))
  /** The display name for a side of a game: the team in Fixed teams, otherwise the players. */
  const sideName = (ids: string[]) => ids.map((id) => byId.get(id)?.name ?? '?').join(' & ')

  // Iron Man / Iron Woman: most games, then most time on court. Needs a real lead (at least 2 games played).
  const maxPlayed = Math.max(...rows.map((r) => r.played))
  if (maxPlayed >= 2) {
    const top = rows.filter((r) => r.played === maxPlayed)
    const bestMs = Math.max(...top.map((r) => r.playMs))
    const tied = top.filter((r) => r.playMs === bestMs)
    const g = shared(tied.map((r) => r.name), rows.length, `${maxPlayed} games${bestMs > 0 ? ` · ${fmtMin(bestMs)} on court` : ''}`)
    if (g) out.push({ id: 'iron', emoji: '🦾', title: 'Iron Player', ...g })
  }

  // Clutch Closer: wins in close games (won by 2 or less), when scores were entered.
  const clutch = new Map<string, number>()
  for (const m of s.matches) {
    if (!isClose(m)) continue
    const side = m.winner === 'a' ? m.a : m.b
    if (teams) {
      const key = [...side].sort().join('+')
      clutch.set(key, (clutch.get(key) ?? 0) + 1)
    } else {
      for (const id of side) clutch.set(id, (clutch.get(id) ?? 0) + 1)
    }
  }
  if (clutch.size) {
    const best = Math.max(...clutch.values())
    const ids = [...clutch].filter(([, n]) => n === best).map(([id]) => id)
    const g = shared(
      ids.map((id) => (teams ? sideName(id.split('+')) : byId.get(id)?.name ?? '?')),
      rows.length,
      `${best} ${best === 1 ? 'win' : 'wins'} by 2 points or less`,
    )
    if (g) out.push({ id: 'clutch', emoji: '🧊', title: 'Clutch Closer', ...g })
  }

  // Social Butterfly: most different partners + opponents met. Needs at least 3 distinct people.
  const social = (teams ? [] : rows)
    .map((r) => ({ r, v: variety(s, r.id) }))
    .map((x) => ({ ...x, total: new Set([...partnersOf(s, x.r.id), ...opponentsOf(s, x.r.id)]).size }))
  const bestSocial = Math.max(0, ...social.map((x) => x.total))
  if (!teams && bestSocial >= 3) {
    const tied = social.filter((x) => x.total === bestSocial)
    // Tiebreak: more games played means the variety is more impressive, so keep only those with the max games.
    const maxGames = Math.max(...tied.map((x) => x.r.played))
    const final = tied.filter((x) => x.r.played === maxGames)
    const v = final[0].v
    const g = shared(
      final.map((x) => x.r.name),
      rows.length,
      `played with ${v.partners} partner${v.partners === 1 ? '' : 's'} and faced ${v.opponents} opponent${v.opponents === 1 ? '' : 's'}`,
    )
    if (g) out.push({ id: 'social', emoji: '🦋', title: 'Social Butterfly', ...g })
  }

  // Marathon Match: the longest recorded game.
  let longest: Match | null = null
  for (const m of s.matches) if ((m.ms ?? 0) > (longest?.ms ?? 0)) longest = m
  if (longest && (longest.ms ?? 0) >= 60_000) {
    out.push({
      id: 'marathon',
      emoji: '⏱️',
      title: 'Marathon Match',
      winner: `${longest.a.map((id) => nameOf(s, id)).join(' & ')} vs ${longest.b.map((id) => nameOf(s, id)).join(' & ')}`,
      detail: `${fmtMin(longest.ms!)} on ${longest.court}`,
    })
  }

  // Win streak: longest run of consecutive wins.
  const streakTop = Math.max(...rows.map((r) => r.longestStreak))
  if (streakTop >= 3) {
    const tied = rows.filter((r) => r.longestStreak === streakTop)
    const g = shared(tied.map((r) => r.name), rows.length, `${streakTop} wins in a row`)
    if (g) out.push({ id: 'streak', emoji: '🔥', title: 'On Fire', ...g })
  }

  // Dynamic Duo: best partnership (min 3 games together).
  const duos = new Map<string, { ids: [string, string]; w: number; l: number }>()
  for (const m of s.matches) {
    if (!m.winner) continue
    for (const side of ['a', 'b'] as const) {
      const ids = side === 'a' ? m.a : m.b
      if (ids.length !== 2) continue
      const k = pairKey(ids[0], ids[1])
      const d = duos.get(k) ?? { ids: [ids[0], ids[1]] as [string, string], w: 0, l: 0 }
      m.winner === side ? d.w++ : d.l++
      duos.set(k, d)
    }
  }
  const duo = [...duos.values()]
    .filter((d) => d.w + d.l >= 3 && d.w > d.l)
    .sort((x, y) => y.w / (y.w + y.l) - x.w / (x.w + x.l) || y.w - x.w)[0]
  if (duo && !teams) {
    out.push({
      id: 'duo',
      emoji: '🤝',
      title: 'Dynamic Duo',
      winner: duo.ids.map((id) => byId.get(id)?.name ?? '?').join(' & '),
      detail: `${duo.w}–${duo.l} as partners`,
    })
  }

  return out
}

function partnersOf(s: Session, id: string): string[] {
  const out: string[] = []
  for (const m of s.matches) {
    const mine = m.a.includes(id) ? m.a : m.b.includes(id) ? m.b : null
    if (mine) out.push(...mine.filter((x) => x !== id))
  }
  return out
}

function opponentsOf(s: Session, id: string): string[] {
  const out: string[] = []
  for (const m of s.matches) {
    if (m.a.includes(id)) out.push(...m.b)
    else if (m.b.includes(id)) out.push(...m.a)
  }
  return out
}
