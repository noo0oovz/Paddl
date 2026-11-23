export type Format = 'doubles' | 'singles' | 'teams'
export type Mode = 'fair' | 'winners' | 'skill' | 'robin'
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
}

export interface Hold {
  ids: string[]
  streak: number
}

export interface Court {
  id: string
  name: string
  match: Live | null
  hold: Hold | null // winners stay: holders waiting for challengers
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
  at: number
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
}

export const FORMAT_INFO: Record<Format, { label: string; blurb: string }> = {
  doubles: { label: 'Doubles', blurb: '2 v 2, partners rotate' },
  singles: { label: 'Singles', blurb: '1 v 1' },
  teams: { label: 'Fixed teams', blurb: 'Pairs that stay together' },
}
