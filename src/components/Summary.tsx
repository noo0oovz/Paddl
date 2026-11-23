import { forwardRef, useRef, useState } from 'react'
import { ArrowLeft, Download, Share2, Trash2 } from 'lucide-react'
import type { Session } from '../engine/types'
import { nameOf, standings, summarize } from '../engine/stats'
import { download, fileName, canShareFile, renderPng, shareImage } from '../lib/exportImage'
import { fmtDate, fmtDuration, fmtTime, join } from '../lib/util'
import { removeSession } from '../store'
import { medal } from './Standings'

const C = { ink: '#0f172a', mute: '#64748b', line: '#e2e8f0', soft: '#f1f5f9', green: '#16a34a', dark: '#14532d', gold: '#f59e0b' }

/** Fixed-width, always-light card that gets rendered to PNG. Inline styles keep it identical in any theme. */
export const ShareCard = forwardRef<HTMLDivElement, { s: Session }>(function ShareCard({ s }, ref) {
  const rows = standings(s)
  const sum = summarize(s)
  const maxGames = Math.max(1, ...rows.map((r) => r.eligible))
  const history = [...s.matches].sort((a, b) => a.seq - b.seq)
  return (
    <div ref={ref} style={{ width: 720, background: '#ffffff', color: C.ink, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ background: `linear-gradient(135deg, ${C.green}, ${C.dark})`, color: '#fff', padding: '28px 32px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, opacity: 0.85 }}>PADDL · FINAL RESULTS</div>
        <div style={{ fontSize: 34, fontWeight: 800, marginTop: 6, lineHeight: 1.15 }}>{s.name}</div>
        <div style={{ fontSize: 14, marginTop: 6, opacity: 0.9 }}>
          {fmtDate(s.createdAt)} · {s.players.length} players · {sum.matches} games · {fmtDuration(sum.durationMs)}
        </div>
      </div>

      <div style={{ padding: '24px 32px 8px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: C.mute, marginBottom: 10 }}>FINAL STANDINGS</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
          <thead>
            <tr style={{ color: C.mute, fontSize: 11, textAlign: 'right' }}>
              <th style={{ textAlign: 'left', padding: '4px 6px', width: 36 }}>#</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>PLAYER</th>
              <th style={{ padding: '4px 6px' }}>W</th>
              <th style={{ padding: '4px 6px' }}>L</th>
              <th style={{ padding: '4px 6px' }}>WIN %</th>
              <th style={{ padding: '4px 6px' }}>+/−</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${C.line}`, background: i === 0 && r.wins > 0 ? '#fffbeb' : undefined, textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 800 }}>{medal(i)}</td>
                <td style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700 }}>{r.name}</td>
                <td style={{ padding: '8px 6px' }}>{r.wins}</td>
                <td style={{ padding: '8px 6px' }}>{r.losses}</td>
                <td style={{ padding: '8px 6px' }}>{r.wins + r.losses ? `${Math.round(r.winPct * 100)}%` : '–'}</td>
                <td style={{ padding: '8px 6px', color: r.diff > 0 ? C.green : r.diff < 0 ? '#dc2626' : C.mute, fontWeight: 600 }}>{r.pf + r.pa ? (r.diff > 0 ? `+${r.diff}` : r.diff) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '16px 32px 8px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: C.mute, marginBottom: 10 }}>GAMES PARTICIPATION</div>
        {[...rows].sort((a, b) => b.played - a.played || a.name.localeCompare(b.name)).map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, fontSize: 14 }}>
            <div style={{ width: 130, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
            <div style={{ flex: 1, height: 14, background: C.soft, borderRadius: 7, overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${(r.played / maxGames) * 100}%`, background: C.green }} />
              <div style={{ width: `${(r.satOut / maxGames) * 100}%`, background: '#cbd5e1' }} />
            </div>
            <div style={{ width: 92, textAlign: 'right', color: C.mute, fontSize: 13 }}><b style={{ color: C.ink }}>{r.played}</b> played{r.satOut ? ` · ${r.satOut} sat` : ''}</div>
          </div>
        ))}
      </div>

      {(sum.bestDuo || sum.biggestWin || sum.hotStreak) && (
        <div style={{ padding: '12px 32px 4px', display: 'flex', gap: 10 }}>
          {sum.bestDuo && <Fact label="BEST DUO" value={join(sum.bestDuo.ids.map((id) => nameOf(s, id)))} sub={`${sum.bestDuo.wins}-${sum.bestDuo.losses} together`} />}
          {sum.hotStreak && <Fact label="HOT STREAK" value={sum.hotStreak.name} sub={`${sum.hotStreak.longestStreak} wins in a row`} />}
          {sum.biggestWin && <Fact label="BIGGEST WIN" value={`${sum.biggestWin.scoreA}–${sum.biggestWin.scoreB}`} sub={join((sum.biggestWin.winner === 'a' ? sum.biggestWin.a : sum.biggestWin.b).map((id) => nameOf(s, id)))} />}
        </div>
      )}

      <div style={{ padding: '16px 32px 8px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: C.mute, marginBottom: 10 }}>MATCH HISTORY</div>
        {history.length === 0 && <div style={{ color: C.mute, fontSize: 14 }}>No games were recorded.</div>}
        {history.map((m) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: `1px solid ${C.line}`, fontSize: 13.5 }}>
            <div style={{ width: 28, color: C.mute, fontWeight: 700 }}>#{m.seq}</div>
            <div style={{ flex: 1, textAlign: 'right', fontWeight: m.winner === 'a' ? 800 : 500, color: m.winner === 'b' ? C.mute : C.ink }}>{join(m.a.map((id) => nameOf(s, id)))}</div>
            <div style={{ minWidth: 64, textAlign: 'center', fontWeight: 800, background: C.soft, borderRadius: 8, padding: '3px 6px' }}>
              {m.scoreA !== null ? `${m.scoreA} – ${m.scoreB}` : m.winner ? (m.winner === 'a' ? '✓ – ' : ' – ✓') : 'N/C'}
            </div>
            <div style={{ flex: 1, textAlign: 'left', fontWeight: m.winner === 'b' ? 800 : 500, color: m.winner === 'a' ? C.mute : C.ink }}>{join(m.b.map((id) => nameOf(s, id)))}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '14px 32px 20px', color: C.mute, fontSize: 12, textAlign: 'center', borderTop: `1px solid ${C.line}`, marginTop: 8 }}>
        Made with Paddl · {fmtTime(s.endedAt ?? Date.now())}
      </div>
    </div>
  )
})

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ flex: 1, background: C.soft, borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: C.mute }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 12, color: C.mute }}>{sub}</div>
    </div>
  )
}

export default function Summary({ s, onBack }: { s: Session; onBack: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const sum = summarize(s)
  const top = standings(s).slice(0, 3)

  async function make(): Promise<Blob | null> {
    if (!cardRef.current) return null
    setBusy(true)
    setMsg(null)
    try {
      return await renderPng(cardRef.current)
    } catch {
      setMsg('Could not create the image. Try again.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    const blob = await make()
    if (blob) { download(blob, fileName(s.name)); setMsg('Image saved to your downloads.') }
  }

  async function share() {
    const blob = await make()
    if (!blob) return
    const name = fileName(s.name)
    if (canShareFile(blob, name)) {
      try { await shareImage(blob, name, s.name) } catch { download(blob, name); setMsg('Sharing is not available here, so the image was saved instead.') }
    } else {
      download(blob, name)
      setMsg('Image saved to your downloads.')
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-10">
      <button className="btn-ghost -ml-3 mb-2" onClick={onBack}><ArrowLeft size={18} /> Back</button>
      <div className="text-xs font-bold tracking-widest text-green-700 dark:text-green-400">FINAL RESULTS</div>
      <h1 className="text-2xl font-extrabold">{s.name}</h1>
      <p className="text-sm text-slate-500">{fmtDate(s.createdAt)} · {sum.matches} games · {fmtDuration(sum.durationMs)}</p>

      {top[0] && top[0].wins > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {top.map((p, i) => (
            <div key={p.id} className="card p-3">
              <div className="text-2xl">{medal(i)}</div>
              <div className="truncate font-bold">{p.name}</div>
              <div className="text-xs text-slate-500">{p.wins}W – {p.losses}L</div>
            </div>
          ))}
        </div>
      )}

      <div className="sticky top-0 z-10 -mx-4 mt-4 flex gap-2 border-b border-slate-200 bg-slate-100/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <button className="btn-primary flex-1 !min-h-12" onClick={save} disabled={busy}><Download size={18} /> {busy ? 'Creating…' : 'Save image'}</button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button className="btn-soft flex-1 !min-h-12" onClick={share} disabled={busy}><Share2 size={18} /> Share</button>
        )}
      </div>
      {msg && <p className="mt-2 text-sm font-medium text-green-700 dark:text-green-400" role="status">{msg}</p>}

      <p className="mt-4 mb-2 text-xs text-slate-500">This is the image that will be saved:</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800">
        <div className="mx-auto w-fit"><ShareCard ref={cardRef} s={s} /></div>
      </div>

      <button
        className="btn-ghost mt-6 w-full text-red-600"
        onClick={() => { if (confirm('Delete this session and its history for good?')) { removeSession(s.id); onBack() } }}
      >
        <Trash2 size={16} /> Delete this session
      </button>
    </div>
  )
}
