import { awardsByName } from '../engine/insights'
import { standings } from '../engine/stats'
import type { Session } from '../engine/types'
import { Empty } from './ui'

export function medal(i: number): string {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1)
}

export default function Standings({ s }: { s: Session }) {
  const rows = standings(s)
  const scored = rows.some((r) => r.pf + r.pa > 0)
  const badges = awardsByName(s)
  if (!s.players.length) return <Empty scene="players" title="No players yet" hint="Open Courts, then Players, to add some." />
  const played = s.matches.length > 0
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-6">
      <h1 className="mb-3 text-xl font-extrabold">Standings</h1>
      {!played && <p className="mb-3 text-sm text-slate-500">Standings appear after the first game is recorded.</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
              <th className="px-3 py-2.5">#</th>
              <th className="px-2 py-2.5">Player</th>
              <th className="px-2 py-2.5 text-right">W</th>
              <th className="px-2 py-2.5 text-right">L</th>
              <th className="px-2 py-2.5 text-right">Win %</th>
              <th className="px-2 py-2.5 text-right">{scored ? '+/−' : 'Awards'}</th>
              <th className="px-3 py-2.5 text-right">GP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                <td className="px-3 py-2.5 font-bold">{played ? medal(i) : '–'}</td>
                <td className="max-w-[9rem] truncate px-2 py-2.5 font-semibold">
                  {r.name}
                  {r.status !== 'active' && <span className="ml-1 text-xs font-normal text-slate-400">({r.status === 'resting' ? 'break' : 'left'})</span>}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.wins}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.losses}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.wins + r.losses ? Math.round(r.winPct * 100) : '–'}</td>
                {scored ? (
                  <td className={`px-2 py-2.5 text-right tabular-nums ${r.diff > 0 ? 'text-green-600' : r.diff < 0 ? 'text-red-600' : ''}`}>{r.pf + r.pa ? (r.diff > 0 ? `+${r.diff}` : r.diff) : '–'}</td>
                ) : (
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">{(badges.get(r.name) ?? []).map((a) => <span key={a.id} title={a.title} aria-label={a.title} className="ml-0.5">{a.emoji}</span>)}</td>
                )}
                <td className="px-3 py-2.5 text-right tabular-nums">{r.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!scored && [...new Map([...badges.values()].flat().map((a) => [a.id, a])).values()].length > 0 && (
        <p className="mt-2 text-xs text-slate-500">{[...new Map([...badges.values()].flat().map((a) => [a.id, a])).values()].map((a) => `${a.emoji} ${a.title}`).join('  ·  ')}</p>
      )}
      <p className="mt-2 text-xs text-slate-500">Ranked by win rate (small samples are smoothed){scored ? ', then point difference' : ''}. GP = games played.</p>
    </div>
  )
}
