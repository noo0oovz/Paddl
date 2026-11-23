export type Format = 'doubles' | 'singles' | 'teams'
export type Mode = 'fair' | 'winners' | 'skill' | 'robin' | 'mystery'
export type CourtTag = 'fast' | 'beginner' | 'challenger' | 'windy'

export const COURT_TAGS: Record<CourtTag, { label: string; emoji: string; hint: string }> = {
  fast: { label: 'Fast / Rally', emoji: '⚡', hint: 'Quick games, keep it moving' },
  beginner: { label: 'Beginner friendly', emoji: '🌱', hint: 'Relaxed pace, all levels welcome' },
  challenger: { label: 'Challenger', emoji: '👑', hint: 'Winners stay on and streaks are announced' },
  windy: { label: 'Windy / Sun side', emoji: '🌬️', hint: 'Tough conditions, swap ends often' },
}
export type Status = 'active' | 'resting' | 'left'

export interface Config {
  format: Format
  mode: Mode
  courts: number
  target: number // points to win a game
  winBy2: boolean
  cap: number | null // hard score cap, null = none
  maxStreak: number // winners stay: max consecutive wins on a court
  lateJoinMedian: boolean // late joiners / returners start at the median games played
  challengerCourt?: boolean // at session start, make Court 1 a challenger court
  winnersSplit?: boolean // winners stay: the winning pair splits and each partners a challenger (doubles only)
  breakReturn?: 'keep' | 'back' // coming back from a break: keep earned place in line, or rejoin at the back
}

export interface Player {
  id: string
  name: string
  level: number // 2.0 - 5.5 skill rating
  status: Status
  baseGames: number // credited games (late join / return from rest)
  prio?: 'front' | 'back' // manual queue override: "play next" / "send to back"
  prioAt?: number // ordering among overrides
  lastPlayed: number // session.seq when last finished a game or joined the queue
  intervals: [number, number | null][] // seq ranges during which the player was active
}

export interface Team {
  id: string
  name: string
  playerIds: [string, string]
}

export interface Live {
  a: string[]
  b: string[]
  startedAt: number
  streak: number // wins already banked by side `a` (the holders). 0 = fresh match
  gid?: number // unique game number (never repeats), so a tap can be tied to the exact game on screen
  /** Winners stay & split only: consecutive wins each incoming winner is carrying, keyed by player id. */
  streaks?: Record<string, number>
}

export interface Hold {
  ids: string[]
  streak: number
  /** Winners stay & split: the streak each winner carries (a pair that split keeps separate counts). */
  streaks?: Record<string, number>
}

export interface Court {
  id: string
  name: string
  match: Live | null
  hold: Hold | null // winners stay: holders waiting for challengers
  tags?: CourtTag[] // rule badges shown on the court card; "challenger" makes this court winners-stay
}

export interface Match {
  id: string
  seq: number
  court: string
  a: string[]
  b: string[]
  scoreA: number | null
  scoreB: number | null
  winner: 'a' | 'b' | null
  streak?: number // on a winners-stay / challenger court: how many in a row the winners now have
  at: number // when the game was recorded
  ms?: number // how long the game lasted on court (missing on games saved by older versions)
}

export interface Session {
  id: string
  name: string
  createdAt: number
  endedAt: number | null
  config: Config
  players: Player[]
  teams: Team[]
  courts: Court[]
  matches: Match[]
  seq: number
  nextId: number
  remix?: number // shuffle seed, bumped each time the host remixes
  fresh?: boolean // a remix is pending: the next match drawn uses extra randomness and a wider pool
}

export const DEFAULT_CONFIG: Config = {
  format: 'doubles',
  mode: 'fair',
  courts: 2,
  target: 11,
  winBy2: true,
  cap: null,
  maxStreak: 3,
  lateJoinMedian: true,
}

export const MODE_INFO: Record<Mode, { label: string; blurb: string }> = {
  fair: { label: 'Fair rotation', blurb: 'Fewest games play first. Avoids repeat partners and opponents.' },
  winners: { label: 'Winners stay', blurb: 'Winners hold the court up to a cap, losers go to the back.' },
  skill: { label: 'Skill balanced', blurb: 'Builds evenly matched teams from player levels.' },
  robin: { label: 'Round robin', blurb: 'Everyone partners and faces everyone as evenly as possible.' },
  mystery: { label: 'Mystery mix', blurb: 'Surprise teams every game for social nights. Still fair on games played.' },
}

export const FORMAT_INFO: Record<Format, { label: string; blurb: string }> = {
  doubles: { label: 'Doubles', blurb: '2 v 2, partners rotate' },
  singles: { label: 'Singles', blurb: '1 v 1' },
  teams: { label: 'Fixed teams', blurb: 'Pairs that stay together' },
}
