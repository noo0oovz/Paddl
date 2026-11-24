import { useState } from 'react'
import { ChevronDown, Crown, Flame, Timer, Trophy } from 'lucide-react'
import type { Session } from '../engine/types'
import { PaddleBall } from './art'
import { nameOf, standings, summarize, type PlayerStat } from '../engine/stats'
import { join } from '../lib/util'
import { awardsByName } from '../engine/insights'

/** Time on court as minutes ("38 min", "1 h 5 min"); under a minute shows "<1 min", no data shows a dash. */
export function minutes(ms: number): string {
  if (ms <= 0) return '–'
  const m = Math.round(ms / 60000)
  if (m < 1) return '<1 min'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

const MEDAL = ['🥇', '🥈', '🥉']
const medal = (i: number) => MEDAL[i] ?? String(i + 1)

/* ----------------------------------------------------------------------------------------------
 * Podium: champion centre-stage, runners-up either side. Built from the same standings as the images.
 * -------------------------------------------------------------------------------------------- */
export function Podium({ rows }: { rows: PlayerStat[] }) {
  const top = rows.slice(0, 3).filter((r) => r.wins > 0)
  if (!top.length) return null
  // Visual order: 2nd, 1st, 3rd.
  const order = [top[1], top[0], top[2]]
  const place = [1, 0, 2]
  const height = ['h-16', 'h-24', 'h-12']
  return (
    <section className="card relative mt-5 overflow-hidden px-3 pt-6 pb-0 text-center" aria-label="Podium">
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-accent/10 to-transparent" />
            <div className="relative grid grid-cols-3 items-end gap-2 border-b-2 border-accent/60 shadow-[0_8px_24px_-12px_rgba(182,255,59,0.7)]">
        {order.map((p, col) => {
          if (!p) return <div key={col} />
          const i = place[col]
          const first = i === 0
          return (
            <div key={p.id} className="flex flex-col items-center">
              <div className={first ? 'text-4xl drop-shadow-[0_0_14px_rgba(255,194,51,0.7)]' : 'text-3xl'}>{first ? '👑' : medal(i)}</div>
              <div className={`mt-1 line-clamp-2 w-full px-1 font-black leading-tight tracking-tight break-words ${first ? 'text-lg' : 'text-sm'}`}>{p.name}</div>
              <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{p.wins}W · {p.losses}L</div>
              <div
                className={`flex w-full items-start justify-center rounded-t-2xl border border-b-0 pt-2 text-2xl font-black ${height[col]} ${
                  first
                    ? 'border-accent/50 bg-gradient-to-b from-accent/30 to-accent/5 text-brand shadow-[0_0_30px_-8px_rgba(182,255,59,0.7)]'
                    : 'border-slate-200 bg-slate-900/5 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                }`}
              >
                {i + 1}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** A row of headline numbers. */
export function StatStrip({ s }: { s: Session }) {
  const sum = summarize(s)
  const items: [React.ReactNode, string, string][] = [
    [<PaddleBall key="pb" size={22} glow={false} />, String(sum.matches), 'games'],
    ['👥', String(s.players.length), 'players'],
    ['⏱', minutes(sum.durationMs), 'session'],
    ['🔥', sum.hotStreak ? String(sum.hotStreak.longestStreak) : '–', 'best streak'],
  ]
  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {items.map(([e, v, l]) => (
        <div key={l} className="card px-2 py-3 text-center">
          <div className="flex h-5 items-center justify-center text-lg leading-none">{e}</div>
          <div className="mt-1 text-lg font-black tabular-nums leading-tight">{v}</div>
          <div className="text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">{l}</div>
        </div>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------------------------------------
 * The three sections that become the three saved images, shown natively in the app theme.
 * -------------------------------------------------------------------------------------------- */
function Section({ emoji, title, hint, children, defaultOpen = true }: { emoji: string; title: string; hint?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="card mt-4 overflow-hidden">
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="text-xl">{emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-black tracking-tight">{title}</span>
          {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
        </span>
        <ChevronDown size={18} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-slate-200 dark:border-white/10">{children}</div>}
    </section>
  )
}

export function StandingsSection({ s }: { s: Session }) {
  const rows = standings(s)
  const scored = rows.some((r) => r.pf + r.pa > 0)
  const badges = awardsByName(s)
  return (
    <Section emoji="🏆" title="Final standings" hint={scored ? 'Ranked by win rate, then point difference' : 'Ranked by win rate'}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[340px] text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              <th className="px-4 py-2">#</th>
              <th className="px-2 py-2">Player</th>
              <th className="px-2 py-2 text-right">W</th>
              <th className="px-2 py-2 text-right">L</th>
              <th className="px-2 py-2 text-right">Win %</th>
              <th className="px-4 py-2 text-right">{scored ? '+/−' : 'Awards'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={`border-t border-slate-100 dark:border-white/5 ${i === 0 && r.wins > 0 ? 'bg-accent/10' : ''}`}>
                <td className="px-4 py-2.5 font-black">{medal(i)}</td>
                <td className="max-w-[9rem] truncate px-2 py-2.5 font-bold">{r.name}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.wins}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.losses}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.wins + r.losses ? `${Math.round(r.winPct * 100)}%` : '–'}</td>
                {scored ? (
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.diff > 0 ? 'text-brand' : r.diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    {r.pf + r.pa ? (r.diff > 0 ? `+${r.diff}` : r.diff) : '–'}
                  </td>
                ) : (
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{(badges.get(r.name) ?? []).map((a) => <span key={a.id} title={a.title} aria-label={a.title} className="ml-0.5">{a.emoji}</span>)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!scored && [...new Map([...badges.values()].flat().map((a) => [a.id, a])).values()].length > 0 && (
        <p className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{[...new Map([...badges.values()].flat().map((a) => [a.id, a])).values()].map((a) => `${a.emoji} ${a.title}`).join('  ·  ')}</p>
      )}
    </Section>
  )
}

export function ParticipationSection({ s }: { s: Session }) {
  const rows = [...standings(s)].sort((a, b) => b.played - a.played || b.playMs - a.playMs || a.name.localeCompare(b.name))
  const max = Math.max(1, ...rows.map((r) => r.played))
  return (
    <Section emoji="⏱" title="Games played" hint="How many games each player got, and their minutes on court">
      <ul className="space-y-3 px-4 py-4">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-bold">{r.name}</span>
              <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                <b className="text-sm text-slate-900 dark:text-white">{r.played}</b> {r.played === 1 ? 'game' : 'games'} · <b className="text-sm text-slate-900 dark:text-white">{minutes(r.playMs)}</b>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-green-700 to-accent shadow-[0_0_12px_rgba(182,255,59,0.6)] dark:from-accent/70" style={{ width: `${(r.played / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function HistorySection({ s }: { s: Session }) {
  const list = [...s.matches].sort((a, b) => a.seq - b.seq)
  return (
    <Section emoji="🕘" title="Match history" hint={`${list.length} ${list.length === 1 ? 'game' : 'games'} in order`} defaultOpen={list.length <= 12}>
      {list.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">No games were recorded.</p>
      ) : (
        <ol>
          {list.map((m) => (
            <li key={m.id} className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 first:border-t-0 dark:border-white/5">
              <span className="w-7 shrink-0 text-xs font-black text-slate-400">#{m.seq}</span>
              <span className={`min-w-0 flex-1 truncate text-right text-sm ${m.winner === 'a' ? 'font-black' : 'text-slate-500 dark:text-slate-400'}`}>{join(m.a.map((id) => nameOf(s, id)))}</span>
              <span className="min-w-[3.6rem] shrink-0 rounded-lg bg-slate-900/5 px-2 py-1 text-center text-xs font-black tabular-nums dark:bg-white/10">
                {m.scoreA !== null ? `${m.scoreA} – ${m.scoreB}` : m.winner ? (m.winner === 'a' ? '✓ –' : '– ✓') : 'N/C'}
              </span>
              <span className={`min-w-0 flex-1 truncate text-left text-sm ${m.winner === 'b' ? 'font-black' : 'text-slate-500 dark:text-slate-400'}`}>{join(m.b.map((id) => nameOf(s, id)))}</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}

/** Small highlights (best duo, hot streak, biggest win), shown above the sections. */
export function Highlights({ s }: { s: Session }) {
  const sum = summarize(s)
  const items: { icon: React.ReactNode; label: string; value: string; sub: string }[] = []
  if (sum.bestDuo) items.push({ icon: <Crown size={16} />, label: 'Best duo', value: join(sum.bestDuo.ids.map((id) => nameOf(s, id))), sub: `${sum.bestDuo.wins}–${sum.bestDuo.losses} together` })
  if (sum.hotStreak && sum.hotStreak.longestStreak < 3) items.push({ icon: <Flame size={16} />, label: 'Hot streak', value: sum.hotStreak.name, sub: `${sum.hotStreak.longestStreak} in a row` })
  if (sum.biggestWin) items.push({ icon: <Trophy size={16} />, label: 'Biggest win', value: `${sum.biggestWin.scoreA}–${sum.biggestWin.scoreB}`, sub: join((sum.biggestWin.winner === 'a' ? sum.biggestWin.a : sum.biggestWin.b).map((id) => nameOf(s, id))) })
  if (!items.length) return null
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="card flex items-center gap-3 px-3 py-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-brand">{it.icon}</span>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400">{it.label}</span>
            <span className="block truncate text-sm font-black">{it.value}</span>
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{it.sub}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export { Timer }
