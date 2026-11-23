import type { Format, Mode, Player, Session } from './types'
import { countMatches, gamesOf, pairKey, type Counts } from './stats'

/** A schedulable unit: one player, or a fixed team. */
export interface Unit {
  ids: string[]
  games: number
  last: number
  level: number
  key: string
  pri: number // -1 = play next, 0 = normal, 1 = sent to back
  pAt: number
}

function priOf(ps: Player[]): { pri: number; pAt: number } {
  const pri = ps.some((p) => p.prio === 'front') ? -1 : ps.some((p) => p.prio === 'back') ? 1 : 0
  return { pri, pAt: Math.max(0, ...ps.map((p) => p.prioAt ?? 0)) }
}

export interface Proposal {
  a: string[]
  b: string[]
}

export function unitsNeeded(f: Format): number {
  return f === 'doubles' ? 4 : 2
}

/** Players currently on a court or holding one (not available to the queue). */
export function busyIds(s: Session): Set<string> {
  const set = new Set<string>()
  for (const c of s.courts) {
    if (c.match) for (const id of [...c.match.a, ...c.match.b]) set.add(id)
    if (c.hold) for (const id of c.hold.ids) set.add(id)
  }
  return set
}

function hash(str: string): number {
  let x = 2166136261
  for (let i = 0; i < str.length; i++) {
    x ^= str.charCodeAt(i)
    x = Math.imul(x, 16777619)
  }
  return ((x >>> 0) % 1000) / 1000
}

export function availableUnits(s: Session, exclude: Set<string>, counts: Counts): Unit[] {
  const ok = (p: Player | undefined): p is Player => !!p && p.status === 'active' && !exclude.has(p.id)
  const byId = new Map(s.players.map((p) => [p.id, p]))
  if (s.config.format === 'teams') {
    const out: Unit[] = []
    for (const t of s.teams) {
      const ps = t.playerIds.map((id) => byId.get(id))
      if (!ps.every(ok)) continue
      const live = ps as Player[]
      out.push({
        ids: [...t.playerIds],
        games: Math.max(...live.map((p) => gamesOf(p, counts))),
        last: Math.max(...live.map((p) => p.lastPlayed)),
        level: live[0].level + live[1].level,
        key: t.id,
        ...priOf(live),
      })
    }
    return out
  }
  return s.players
    .filter((p) => ok(p))
    .map((p) => ({ ids: [p.id], games: gamesOf(p, counts), last: p.lastPlayed, level: p.level, key: p.id, ...priOf([p]) }))
}

/** Queue order: winners-stay is first-come-first-served; the rest favour fewest games, then longest wait. */
export function sortUnits(s: Session, units: Unit[], mode: Mode): Unit[] {
  // Stable between games: if this changed whenever a game finished, the order of the line (and so the match shown
  // as "on deck") would reshuffle at the very moment it was supposed to start.
  const salt = `${s.config.mode === 'mystery' ? Math.floor(s.seq) : 0}:${s.remix ?? 0}`
  const tie = (x: Unit, y: Unit) => hash(x.key + salt) - hash(y.key + salt)
  return [...units].sort(
    (x, y) =>
      x.pri - y.pri ||
      (x.pri !== 0 ? x.pAt - y.pAt : 0) ||
      (mode === 'winners'
        ? x.last - y.last || x.games - y.games || tie(x, y)
        : x.games - y.games || x.last - y.last || tie(x, y)),
  )
}

/** The waiting line, in the order players will be picked. */
export function waitingUnits(s: Session): Unit[] {
  const counts = countMatches(s.matches)
  return sortUnits(s, availableUnits(s, busyIds(s), counts), s.config.mode)
}

function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const out: T[][] = []
  const rec = (start: number, cur: T[]) => {
    if (cur.length === k) { out.push([...cur]); return }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop() }
  }
  rec(0, [])
  return out
}

const WEIGHTS: Record<Mode, { partner: number; opp: number; skill: number; square: boolean }> = {
  fair: { partner: 10, opp: 3, skill: 0, square: false },
  winners: { partner: 10, opp: 3, skill: 0, square: false },
  skill: { partner: 4, opp: 1, skill: 25, square: false },
  robin: { partner: 10, opp: 8, skill: 0, square: true },
  mystery: { partner: 8, opp: 2, skill: 0, square: false },
}

/** Randomised, wider-pool drawing: used after a host remix and for Mystery mix. */
/** Seed for choices that should stay the same between games: only Mystery mix wants a fresh draw every game. */
function seedOf(s: Session): number {
  return s.config.mode === 'mystery' ? Math.floor(s.seq) : 0
}

function shuffly(s: Session): boolean {
  return !!s.fresh || s.config.mode === 'mystery'
}

function splitCost(s: Session, counts: Counts, A: Unit[], B: Unit[]): number {
  const w = WEIGHTS[s.config.mode]
  const pen = (c: number) => (w.square ? c * c : c)
  let cost = 0
  if (s.config.format === 'doubles') {
    cost += w.partner * pen(counts.partner.get(pairKey(A[0].ids[0], A[1].ids[0])) ?? 0)
    cost += w.partner * pen(counts.partner.get(pairKey(B[0].ids[0], B[1].ids[0])) ?? 0)
  }
  const aIds = A.flatMap((u) => u.ids)
  const bIds = B.flatMap((u) => u.ids)
  for (const x of aIds) for (const y of bIds) cost += w.opp * pen(counts.opp.get(pairKey(x, y)) ?? 0)
  if (w.skill) {
    const la = A.reduce((n, u) => n + u.level, 0)
    const lb = B.reduce((n, u) => n + u.level, 0)
    cost += w.skill * Math.abs(la - lb)
  }
  // Tiny deterministic jitter so equal options do not always pick the sign-up order.
  // After a host remix the jitter is strong enough to break out of the "best" (repeating) split.
  cost += hash(aIds.join() + '/' + bIds.join() + ':' + seedOf(s) + ':' + (s.remix ?? 0)) * (shuffly(s) ? 5 : 0.4)
  return cost
}

/**
 * Skill mode only: how far apart the strongest and weakest player in this group are. Added to the cost of a group so
 * that, among players who are equally owed a game, similar levels end up together. It never excludes anyone (fairness
 * on games played is decided first), so a game can always be formed and nobody sits idle waiting for a perfect match.
 */
function spreadPenalty(s: Session, set: Unit[]): number {
  if (s.config.mode !== 'skill' || set.length < 2) return 0
  const per = set.map((u) => u.level / u.ids.length) // a fixed team's level is the average of the pair
  return (Math.max(...per) - Math.min(...per)) * 12
}

function splitsOf<T>(set: T[], format: Format): [T[], T[]][] {
  if (format === 'doubles') {
    return [
      [[set[0], set[1]], [set[2], set[3]]],
      [[set[0], set[2]], [set[1], set[3]]],
      [[set[0], set[3]], [set[1], set[2]]],
    ]
  }
  return [[[set[0]], [set[1]]]]
}

/** Pick the next full match from the available units, or null if there are not enough. */
export function proposeMatch(s: Session, exclude: Set<string>, counts = countMatches(s.matches)): Proposal | null {
  const need = unitsNeeded(s.config.format)
  const units = sortUnits(s, availableUnits(s, exclude, counts), s.config.mode)
  if (units.length < need) return null

  // Manual overrides: "play next" players are forced in, "sent to back" players only fill leftover spots.
  const front = units.filter((u) => u.pri < 0).slice(0, need)
  const normal = units.filter((u) => u.pri === 0)
  const back = units.filter((u) => u.pri > 0)
  const r = need - front.length
  let candidates: Unit[][]
  let rankOf = (_: Unit) => 0
  if (r === 0) {
    candidates = [front]
  } else if (s.config.mode === 'winners' || normal.length < r) {
    candidates = [[...front, ...[...normal, ...back].slice(0, r)]]
  } else {
    // Everyone with fewer games than the cut-off is guaranteed a spot; the rest is chosen among ties.
    const cutoff = normal[r - 1].games
    const must = normal.filter((u) => u.games < cutoff)
    const needed = r - must.length
    let tied = normal.filter((u) => u.games >= cutoff && (shuffly(s) ? u.games <= cutoff + 1 : u.games === cutoff))
    if (!shuffly(s)) {
      // Waiting longer beats variety. Among players on the same number of games, only those who have waited at least
      // as long as the last person who would get in are eligible, so someone who has just come off court can never
      // be picked ahead of someone who was already waiting (that is what made the "on deck" match change).
      const lastIn = tied[needed - 1]
      if (lastIn) tied = tied.filter((u) => u.last <= lastIn.last)
    }
    tied = tied.slice(0, 9)
    rankOf = (u) => (shuffly(s) ? 0 : tied.indexOf(u))
    candidates = combos(tied, needed).map((c) => [...front, ...must, ...c])
  }

  let best: { cost: number; a: Unit[]; b: Unit[] } | null = null
  for (const set of candidates) {
    const rank = set.reduce((n, u) => n + Math.max(0, rankOf(u)), 0) + spreadPenalty(s, set)
    for (const [A, B] of splitsOf(set, s.config.format)) {
      const cost = rank + splitCost(s, counts, A, B)
      if (!best || cost < best.cost) best = { cost, a: A, b: B }
    }
  }
  if (!best) return null
  return { a: best.a.flatMap((u) => u.ids), b: best.b.flatMap((u) => u.ids) }
}

/** Winners stay: the next challengers (one team) for a holding side. */
export function proposeChallengers(s: Session, exclude: Set<string>, counts = countMatches(s.matches)): string[] | null {
  const units = sortUnits(s, availableUnits(s, exclude, counts), 'winners')
  if (s.config.format !== 'doubles') return units.length ? units[0].ids : null
  if (units.length < 2) return null
  const first = units[0]
  const pool = units.slice(1, 4)
  let best = pool[0]
  let bestN = Infinity
  for (const u of pool) {
    const n = (counts.partner.get(pairKey(first.ids[0], u.ids[0])) ?? 0) + (shuffly(s) ? hash(u.key + ':' + (s.remix ?? 0) + ':' + seedOf(s)) * 3 : 0)
    if (n < bestN) { bestN = n; best = u }
  }
  return [first.ids[0], best.ids[0]]
}

/**
 * Winners stay & split: the two winners go to opposite sides, and each is paired with one incoming player.
 * Returns the new teams, or null when fewer than two people are waiting. The challengers are the two who have waited
 * longest; between the two possible pairings the one with fewer repeated partnerships wins.
 */
export function splitWinners(s: Session, winners: string[], exclude: Set<string>, counts = countMatches(s.matches)): { a: string[]; b: string[] } | null {
  if (s.config.format !== 'doubles' || winners.length !== 2) return null
  const units = sortUnits(s, availableUnits(s, exclude, counts), 'winners')
  if (units.length < 2) return null
  const [c1, c2] = [units[0].ids[0], units[1].ids[0]]
  const [w1, w2] = winners
  const cost = (p: string, q: string) => counts.partner.get(pairKey(p, q)) ?? 0
  const straight = cost(w1, c1) + cost(w2, c2)
  const crossed = cost(w1, c2) + cost(w2, c1)
  return crossed < straight ? { a: [w1, c2], b: [w2, c1] } : { a: [w1, c1], b: [w2, c2] }
}

/** Order-independent fingerprint of a match-up, used to tell whether a remix actually changed anything. */
export function matchSig(a: string[], b: string[] | null): string {
  return [a, b ?? []].map((x) => [...x].sort().join('+')).sort().join('/')
}

export interface Preview {
  a: string[]
  b: string[] | null // null = challengers only (winners stay)
}

/** What the next few matches will look like once courts free up. */
export function previewQueue(s: Session, count: number): Preview[] {
  const counts = countMatches(s.matches)
  const excl = busyIds(s)
  const out: Preview[] = []
  while (out.length < count) {
    if (s.config.mode === 'winners') {
      const ch = proposeChallengers(s, excl, counts)
      if (!ch) break
      out.push({ a: ch, b: null })
      ch.forEach((id) => excl.add(id))
    } else {
      const m = proposeMatch(s, excl, counts)
      if (!m) break
      out.push(m)
      for (const id of [...m.a, ...m.b]) excl.add(id)
    }
  }
  return out
}
