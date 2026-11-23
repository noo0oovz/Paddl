import type { Session } from '../engine/types'
import { nameOf, standings } from '../engine/stats'

/**
 * One CSV cell. Quotes are doubled and the cell is wrapped when it holds a comma, quote or line break. A cell that
 * starts with = + - or @ is prefixed with an apostrophe, so a spreadsheet shows it as text instead of running it as
 * a formula (a player named "=HYPERLINK(...)" must not do anything when the file is opened).
 */
export function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const row = (cells: (string | number | null | undefined)[]) => cells.map(cell).join(',')

const mins = (ms: number | undefined) => (ms && ms > 0 ? Math.round(ms / 60000) : '')

/** Standings, then every game, in one file. Opens cleanly in Excel, Numbers and Google Sheets. */
export function resultsCsv(s: Session): string {
  const out: string[] = []
  const teams = s.config.format === 'teams'
  out.push(row([s.name]))
  out.push(row([new Date(s.createdAt).toISOString().slice(0, 10), `${s.matches.length} games`, `${s.players.length} players`]))
  out.push('')
  out.push(row(['Standings']))
  out.push(row(['Rank', teams ? 'Team' : 'Player', 'Wins', 'Losses', 'Win %', 'Points for', 'Points against', 'Difference', 'Games', 'Minutes on court']))
  standings(s).forEach((r, i) => {
    const decided = r.wins + r.losses
    out.push(row([i + 1, r.name, r.wins, r.losses, decided ? Math.round(r.winPct * 100) : '', r.pf || '', r.pa || '', r.pf + r.pa ? r.diff : '', r.played, mins(r.playMs)]))
  })
  out.push('')
  out.push(row(['Games']))
  out.push(row(['Game', 'Court', 'Team A', 'Team B', 'Score A', 'Score B', 'Winner', 'Minutes']))
  for (const m of [...s.matches].sort((a, b) => a.seq - b.seq)) {
    const a = m.a.map((id) => nameOf(s, id)).join(' & ')
    const b = m.b.map((id) => nameOf(s, id)).join(' & ')
    out.push(row([m.seq, m.court, a, b, m.scoreA, m.scoreB, m.winner === 'a' ? a : m.winner === 'b' ? b : 'No contest', mins(m.ms)]))
  }
  // CRLF line endings and a BOM so Excel on Windows reads accented and non-Latin names correctly.
  return '﻿' + out.join('\r\n') + '\r\n'
}
