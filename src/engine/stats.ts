import type { Match, Player, Session } from './types'

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export interface Counts {
  games: Map<string, number>
  partner: Map<string, number>
  opp: Map<string, number>
}

export function countMatches(matches: Match[]): Counts {
  const games = new Map<string, number>()
  const partner = new Map<string, number>()
  const opp = new Map<string, number>()
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  for (const m of matches) {
    for (const id of [...m.a, ...m.b]) inc(games, id)
    for (const side of [m.a, m.b]) if (side.length === 2) inc(partner, pairKey(side[0], side[1]))
    for (const x of m.a) for (const y of m.b) inc(opp, pairKey(x, y))
  }
  return { games, partner, opp }
}

/** Games used to order the queue: games actually played plus any catch-up credit given to a late joiner or returner. */
export function gamesOf(p: Player, counts: Counts): number {
  return p.baseGames + (counts.games.get(p.id) ?? 0)
}

/** Games a player has really played. This is what people see; the catch-up credit above is only for ordering the queue. */
export function playedOf(p: Player, counts: Counts): number {
  return counts.games.get(p.id) ?? 0
}

/** Median games played among active players (places late joiners fairly). */
export function medianGames(s: Session, counts: Counts = countMatches(s.matches), excludeId?: string): number {
  const g = s.players
    .filter((p) => p.status === 'active' && p.id !== excludeId)
    .map((p) => gamesOf(p, counts))
    .sort((x, y) => x - y)
  if (!g.length) return 0
  return g[Math.floor((g.length - 1) / 2)]
}

export interface PlayerStat {
  id: string
  name: string
  status: Player['status']
  played: number
  wins: number
  losses: number
  pf: number
  pa: number
  diff: number
  winPct: number
  eligible: number // games finished while the player was active
  satOut: number
  longestStreak: number
  playMs: number // total time spent on court
}

/**
 * Ranked results. In Fixed teams mode the unit that plays and wins is the team, so each team is ONE row named
 * "Josh & Daria" (a team's partners always share every game, so the row is just the partners' common record).
 * In every other mode it is one row per player.
 */
export function standings(s: Session): PlayerStat[] {
  const rows = playerStandings(s)
  if (s.config.format !== 'teams' || !s.teams.length) return rows
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out: PlayerStat[] = []
  for (const team of s.teams) {
    const [a, b] = team.playerIds.map((id) => byId.get(id))
    if (!a || !b) continue
    // Partners share every game; if one joined later or left, the row reflects the shared record (the larger one).
    const lead = a.played >= b.played ? a : b
    out.push({
      ...lead,
      id: team.id,
      name: team.playerIds.map((id) => byId.get(id)!.name).join(' & '),
      status: a.status === 'active' || b.status === 'active' ? 'active' : a.status,
    })
  }
  return rankRows(out)
}

/**
 * What a player's place is decided by, best first: a smoothed win rate (so a lucky 1-0 does not outrank a solid 5-1; anyone
 * with no decided game ranks below everyone who has one), then points difference, then wins. Two players with the same three
 * numbers are TIED. This one rule both orders the list and decides ties, so the table, the podium and the share pictures
 * cannot disagree about who is level.
 */
function rankKey(x: PlayerStat): [number, number, number] {
  const rate = x.wins + x.losses === 0 ? -1 : (x.wins + 1) / (x.wins + x.losses + 2)
  return [rate, x.diff, x.wins]
}
const sameRank = (x: PlayerStat, y: PlayerStat) => rankKey(x).every((v, i) => Math.abs(v - rankKey(y)[i]) < 1e-9)

function rankRows(rows: PlayerStat[]): PlayerStat[] {
  // Games played and name only decide the ORDER inside a tie (so the list is stable); they never split a place.
  return [...rows].sort((x, y) => {
    const kx = rankKey(x), ky = rankKey(y)
    for (let i = 0; i < kx.length; i++) if (Math.abs(ky[i] - kx[i]) > 1e-9) return ky[i] - kx[i]
    return y.played - x.played || x.name.localeCompare(y.name)
  })
}

/**
 * The place of every row, for a list already sorted best first. Players who are level share a place, and the next place
 * skips the people before it: 1, 2, 2, 2, 2, 6 (four tied for 2nd, so the next player is 6th, not 3rd).
 */
export function placesOf(rows: PlayerStat[]): number[] {
  const out: number[] = []
  rows.forEach((r, i) => out.push(i > 0 && sameRank(rows[i - 1], r) ? out[i - 1] : i + 1))
  return out
}

/**
 * How many players share each row's place (1 = a place on its own, 2 or more = a tie: equal records, so nothing says who is
 * better). Standard competition ranking applies to the whole table: tied players share a number and the next number skips them.
 */
export function tieSizes(rows: PlayerStat[]): number[] {
  const places = placesOf(rows)
  return places.map((p) => places.filter((q) => q === p).length)
}

/** "1st", "2nd", "3rd", "4th" ... "11th", "12th", "21st". */
export function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/**
 * One sentence about any tie, or null when there is none. "1, 1, 3" or "4, 4, 6" looks like a mistake until it is explained, so it names
 * the shared places and says the numbers after them are skipped. Players with no decided game are left out.
 */
export function tieNote(rows: PlayerStat[]): string | null {
  const places = placesOf(rows.filter((r) => r.wins + r.losses > 0))
  const shared = [...new Set(places.filter((p) => places.filter((q) => q === p).length > 1))].sort((x, y) => x - y)
  if (!shared.length) return null
  const shown = shared.slice(0, 3).map(ordinal)
  const who = shared.length > 3 ? shown.join(', ') + ' and more' : shown.length === 1 ? shown[0] : shown.slice(0, -1).join(', ') + ' and ' + shown[shown.length - 1]
  return `Players with the same record share a place (tied for ${who}), so the places right after are skipped.`
}

/**
 * Who stands on the podium: everyone in the top three PLACES who has won a game, so a tie for 2nd shows every player
 * tied for 2nd (and nobody is called 3rd). At most 5 are shown, so a big tie cannot take over the page.
 */
export function podiumOf(rows: PlayerStat[], max = 5): { row: PlayerStat; place: number }[] {
  const places = placesOf(rows)
  const out: { row: PlayerStat; place: number }[] = []
  rows.forEach((row, i) => { if (places[i] <= 3 && row.wins > 0 && out.length < max) out.push({ row, place: places[i] }) })
  return out
}

/** One row per individual player, ranked. */
export function playerStandings(s: Session): PlayerStat[] {
  const ordered = [...s.matches].sort((x, y) => x.seq - y.seq)
  const stats = new Map<string, PlayerStat>()
  const run = new Map<string, number>()
  for (const p of s.players) {
    stats.set(p.id, {
      id: p.id, name: p.name, status: p.status, played: 0, wins: 0, losses: 0,
      pf: 0, pa: 0, diff: 0, winPct: 0, eligible: 0, satOut: 0, longestStreak: 0, playMs: 0,
    })
    run.set(p.id, 0)
  }
  for (const m of ordered) {
    for (const side of ['a', 'b'] as const) {
      const mine = side === 'a' ? m.a : m.b
      const forPts = side === 'a' ? m.scoreA : m.scoreB
      const againstPts = side === 'a' ? m.scoreB : m.scoreA
      for (const id of mine) {
        const st = stats.get(id)
        if (!st) continue
        st.played++
        st.playMs += m.ms ?? 0
        if (m.winner === null) continue
        if (m.winner === side) {
          st.wins++
          const r = (run.get(id) ?? 0) + 1
          run.set(id, r)
          if (r > st.longestStreak) st.longestStreak = r
        } else {
          st.losses++
          run.set(id, 0)
        }
        if (forPts !== null && againstPts !== null) {
          st.pf += forPts
          st.pa += againstPts
        }
      }
    }
  }
  for (const p of s.players) {
    const st = stats.get(p.id)!
    const eligible = s.matches.filter((m) => p.intervals.some(([from, to]) => m.seq > from && (to === null || m.seq <= to))).length
    st.eligible = Math.max(eligible, st.played)
    st.satOut = st.eligible - st.played
    st.diff = st.pf - st.pa
    const decided = st.wins + st.losses
    st.winPct = decided ? st.wins / decided : 0
  }
  return rankRows([...stats.values()])
}

export interface Duo {
  ids: [string, string]
  wins: number
  losses: number
}

export interface Summary {
  matches: number
  totalPoints: number
  durationMs: number
  biggestWin: Match | null
  bestDuo: Duo | null
  mostGames: PlayerStat | null
  hotStreak: PlayerStat | null
}

export function summarize(s: Session): Summary {
  const st = standings(s)
  let biggest: Match | null = null
  let bigMargin = -1
  let totalPoints = 0
  for (const m of s.matches) {
    if (m.scoreA === null || m.scoreB === null || !m.winner) continue
    const margin = Math.abs(m.scoreA - m.scoreB)
    totalPoints += m.scoreA + m.scoreB
    if (margin > bigMargin) { bigMargin = margin; biggest = m }
  }
  const duos = new Map<string, Duo>()
  for (const m of s.matches) {
    if (!m.winner) continue
    for (const side of ['a', 'b'] as const) {
      const ids = side === 'a' ? m.a : m.b
      if (ids.length !== 2) continue
      const k = pairKey(ids[0], ids[1])
      const d = duos.get(k) ?? { ids: [ids[0], ids[1]] as [string, string], wins: 0, losses: 0 }
      if (m.winner === side) d.wins++
      else d.losses++
      duos.set(k, d)
    }
  }
  // In Fixed teams the partners never change, so a "best duo" would just repeat the top team.
  const bestDuo = s.config.format === 'teams' ? null :
    [...duos.values()]
      .filter((d) => d.wins + d.losses >= 2 && d.wins > 0)
      .sort((x, y) => y.wins / (y.wins + y.losses) - x.wins / (x.wins + x.losses) || y.wins - x.wins)[0] ?? null
  const mostGames = [...st].sort((x, y) => y.played - x.played)[0] ?? null
  const hot = [...st].sort((x, y) => y.longestStreak - x.longestStreak)[0] ?? null
  const end = s.endedAt ?? Date.now()
  return {
    matches: s.matches.length,
    totalPoints,
    durationMs: Math.max(0, end - s.createdAt),
    biggestWin: biggest,
    bestDuo,
    mostGames: mostGames && mostGames.played > 0 ? mostGames : null,
    hotStreak: hot && hot.longestStreak >= 2 ? hot : null,
  }
}

export function nameOf(s: Session, id: string): string {
  return s.players.find((p) => p.id === id)?.name ?? '?'
}
