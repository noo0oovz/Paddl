import { forwardRef, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Download, Share2, Sparkles, Trash2 } from 'lucide-react'
import type { Session } from '../engine/types'
import { nameOf, standings, summarize } from '../engine/stats'
import { awards, type Award } from '../engine/insights'
import { download, fileName, canShareFile, renderPng, shareImage } from '../lib/exportImage'
import { fmtDate, fmtDuration, fmtTime, join } from '../lib/util'
import { reopenSession } from '../engine/session'
import { removeSession, updateActive } from '../store'
import { medal } from './Standings'
import ThemeSwitch from './ThemeSwitch'

const C = { ink: '#0f172a', mute: '#64748b', line: '#e2e8f0', soft: '#f1f5f9', green: '#16a34a', dark: '#14532d' }

export type Part = 'standings' | 'participation' | 'history'

const PARTS: { id: Part; title: string; label: string }[] = [
  { id: 'standings', title: 'FINAL STANDINGS', label: 'Final standings' },
  { id: 'participation', title: 'GAMES PARTICIPATION', label: 'Games participation' },
  { id: 'history', title: 'MATCH HISTORY', label: 'Match history' },
]

function Frame({ s, title, children }: { s: Session; title: string; children: ReactNode }) {
  const sum = summarize(s)
  return (
    <>
      <div style={{ background: `linear-gradient(135deg, ${C.green}, ${C.dark})`, color: '#fff', padding: '26px 32px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, opacity: 0.85 }}>PADDL · {title}</div>
        <div style={{ fontSize: 34, fontWeight: 800, marginTop: 6, lineHeight: 1.15 }}>{s.name}</div>
        <div style={{ fontSize: 14, marginTop: 6, opacity: 0.9 }}>
          {fmtDate(s.createdAt)} · {s.players.length} players · {sum.matches} games · {fmtDuration(sum.durationMs)}
        </div>
      </div>
      <div style={{ padding: '22px 32px 8px' }}>{children}</div>
      <div style={{ padding: '14px 32px 20px', color: C.mute, fontSize: 12, textAlign: 'center', borderTop: `1px solid ${C.line}`, marginTop: 8 }}>
        Made with Paddl · {fmtTime(s.endedAt ?? Date.now())}
      </div>
    </>
  )
}

/** "Spotify Wrapped"-style recap: the champion, then playful awards. Always light, fixed width, for sharing. */
export const RecapCard = forwardRef<HTMLDivElement, { s: Session }>(function RecapCard({ s }, ref) {
  const rows = standings(s)
  const list = awards(s)
  const sum = summarize(s)
  const champ = rows[0] && rows[0].wins > 0 ? rows[0] : null
  return (
    <div ref={ref} style={{ width: 720, background: '#ffffff', color: C.ink, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ background: `linear-gradient(135deg, ${C.green}, ${C.dark})`, color: '#fff', padding: '30px 32px 26px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, opacity: 0.85 }}>PADDL · SESSION RECAP</div>
        <div style={{ fontSize: 36, fontWeight: 800, marginTop: 6, lineHeight: 1.15 }}>{s.name}</div>
        <div style={{ fontSize: 14, marginTop: 6, opacity: 0.9 }}>
          {fmtDate(s.createdAt)} · {s.players.length} players · {sum.matches} games · {fmtDuration(sum.durationMs)}
        </div>
        {champ && (
          <div style={{ marginTop: 18, background: 'rgba(255,255,255,0.16)', borderRadius: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 44 }}>🏆</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, opacity: 0.85 }}>TOP OF THE LADDER</div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{champ.name}</div>
              <div style={{ fontSize: 14, opacity: 0.9 }}>{champ.wins} {champ.wins === 1 ? 'win' : 'wins'} · {champ.losses} {champ.losses === 1 ? 'loss' : 'losses'}</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '22px 32px 6px' }}>
        {list.length === 0 && <div style={{ color: C.mute, fontSize: 15, padding: '8px 0 16px' }}>Play a few games and the awards will show up here.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {list.map((a) => (
            <div key={a.id} style={{ background: C.soft, borderRadius: 16, padding: '14px 16px', minWidth: 0 }}>
              <div style={{ fontSize: 28, lineHeight: 1 }}>{a.emoji}</div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: C.mute, marginTop: 8 }}>{a.title.toUpperCase()}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{a.winner}</div>
              <div style={{ fontSize: 13, color: C.mute, marginTop: 3 }}>{a.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 32px 20px', color: C.mute, fontSize: 12, textAlign: 'center', borderTop: `1px solid ${C.line}`, marginTop: 14 }}>
        Made with Paddl · {fmtTime(s.endedAt ?? Date.now())}
      </div>
    </div>
  )
})

/** Fixed-width, always-light card that gets rendered to PNG. Inline styles keep it identical in any theme. */
export const ShareCard = forwardRef<HTMLDivElement, { s: Session; part: Part }>(function ShareCard({ s, part }, ref) {
  const rows = standings(s)
  const sum = summarize(s)
  const maxPlayed = Math.max(1, ...rows.map((r) => r.played))
  const history = [...s.matches].sort((a, b) => a.seq - b.seq)
  const info = PARTS.find((p) => p.id === part)!
  return (
    <div ref={ref} style={{ width: 720, background: '#ffffff', color: C.ink, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
      <Frame s={s} title={info.title}>
        {part === 'standings' && (
          <>
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
            {(sum.bestDuo || sum.biggestWin || sum.hotStreak) && (
              <div style={{ paddingTop: 18, display: 'flex', gap: 10 }}>
                {sum.bestDuo && <Fact label="BEST DUO" value={join(sum.bestDuo.ids.map((id) => nameOf(s, id)))} sub={`${sum.bestDuo.wins}-${sum.bestDuo.losses} together`} />}
                {sum.hotStreak && <Fact label="HOT STREAK" value={sum.hotStreak.name} sub={`${sum.hotStreak.longestStreak} wins in a row`} />}
                {sum.biggestWin && <Fact label="BIGGEST WIN" value={`${sum.biggestWin.scoreA}–${sum.biggestWin.scoreB}`} sub={join((sum.biggestWin.winner === 'a' ? sum.biggestWin.a : sum.biggestWin.b).map((id) => nameOf(s, id)))} />}
              </div>
            )}
          </>
        )}

        {part === 'participation' && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: C.mute }}>
              <div style={{ width: 130 }}>PLAYER</div>
              <div style={{ flex: 1 }}>GAMES PLAYED</div>
              <div style={{ width: 150, textAlign: 'right' }}>GAMES · MINUTES</div>
            </div>
            {[...rows].sort((a, b) => b.played - a.played || b.playMs - a.playMs || a.name.localeCompare(b.name)).map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9, fontSize: 15 }}>
                <div style={{ width: 130, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                <div style={{ flex: 1, height: 16, background: C.soft, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${(r.played / maxPlayed) * 100}%`, height: '100%', background: C.green }} />
                </div>
                <div style={{ width: 150, textAlign: 'right', color: C.mute, fontSize: 14, whiteSpace: 'nowrap' }}>
                  <b style={{ color: C.ink }}>{r.played}</b> {r.played === 1 ? 'game' : 'games'} · <b style={{ color: C.ink }}>{minutes(r.playMs)}</b>
                </div>
              </div>
            ))}
          </>
        )}

        {part === 'history' && (
          <>
            {history.length === 0 && <div style={{ color: C.mute, fontSize: 14 }}>No games were recorded.</div>}
            {history.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.line}`, fontSize: 14 }}>
                <div style={{ width: 30, color: C.mute, fontWeight: 700 }}>#{m.seq}</div>
                <div style={{ flex: 1, textAlign: 'right', fontWeight: m.winner === 'a' ? 800 : 500, color: m.winner === 'b' ? C.mute : C.ink }}>{join(m.a.map((id) => nameOf(s, id)))}</div>
                <div style={{ minWidth: 70, textAlign: 'center', fontWeight: 800, background: C.soft, borderRadius: 8, padding: '3px 6px' }}>
                  {m.scoreA !== null ? `${m.scoreA} – ${m.scoreB}` : m.winner ? (m.winner === 'a' ? '✓ – ' : ' – ✓') : 'N/C'}
                </div>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: m.winner === 'b' ? 800 : 500, color: m.winner === 'a' ? C.mute : C.ink }}>{join(m.b.map((id) => nameOf(s, id)))}</div>
              </div>
            ))}
          </>
        )}
      </Frame>
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

/** Time on court as minutes ("38 min", "1 h 5 min"); under a minute shows "<1 min", no data shows a dash. */
export function minutes(ms: number): string {
  if (ms <= 0) return '–'
  const m = Math.round(ms / 60000)
  if (m < 1) return '<1 min'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

function partFile(s: Session, part: Part, n: number): string {
  return fileName(s.name).replace(/\.png$/, `-${n}-${part}.png`)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function Summary({ s, onBack }: { s: Session; onBack: () => void }) {
  const refs = useRef<Record<Part, HTMLDivElement | null>>({ standings: null, participation: null, history: null })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const sum = summarize(s)
  const top = standings(s).slice(0, 3)
  const recapAwards: Award[] = awards(s)

  async function makeOne(part: Part): Promise<Blob> {
    const node = refs.current[part]
    if (!node) throw new Error('missing card')
    return renderPng(node)
  }

  async function makeAll(): Promise<{ part: Part; blob: Blob; name: string }[] | null> {
    setBusy(true)
    setMsg(null)
    try {
      const out: { part: Part; blob: Blob; name: string }[] = []
      for (const [i, p] of PARTS.entries()) out.push({ part: p.id, blob: await makeOne(p.id), name: partFile(s, p.id, i + 1) })
      return out
    } catch {
      setMsg('Could not create the images. Try again.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function saveAll() {
    const all = await makeAll()
    if (!all) return
    for (const f of all) {
      download(f.blob, f.name)
      await wait(350) // browsers drop downloads fired in the same tick
    }
    setMsg('Saved 3 images: standings, participation and match history.')
  }

  async function shareAll() {
    const all = await makeAll()
    if (!all) return
    const files = all.map((f) => new File([f.blob], f.name, { type: 'image/png' }))
    try {
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files, title: s.name })
        return
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
    for (const f of all) {
      download(f.blob, f.name)
      await wait(350)
    }
    setMsg('Sharing is not available here, so the 3 images were saved instead.')
  }

  const recapRef = useRef<HTMLDivElement>(null)
  async function recap(share: boolean) {
    if (!recapRef.current) return
    setBusy(true)
    setMsg(null)
    try {
      const blob = await renderPng(recapRef.current)
      const name = fileName(s.name).replace(/\.png$/, '-recap.png')
      if (share && canShareFile(blob, name)) {
        try { await shareImage(blob, name, s.name + ' recap') } catch { download(blob, name); setMsg('Sharing is not available here, so the recap was saved instead.') }
      } else {
        download(blob, name)
        setMsg('Recap saved.')
      }
    } catch {
      setMsg('Could not create the recap. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function saveOne(part: Part, n: number) {
    setBusy(true)
    setMsg(null)
    try {
      const blob = await makeOne(part)
      const name = partFile(s, part, n)
      if (canShareFile(blob, name) && typeof navigator.share === 'function' && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await shareImage(blob, name, s.name)
      } else {
        download(blob, name)
        setMsg('Image saved.')
      }
    } catch {
      setMsg('Could not create the image. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-10">
      <div className="mb-2 flex items-center justify-between">
        <button className="btn-ghost -ml-3" onClick={onBack}><ArrowLeft size={18} /> Back</button>
        <ThemeSwitch compact />
      </div>
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

      {recapAwards.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold"><Sparkles size={18} className="text-amber-500" /> Session awards</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {recapAwards.map((a) => (
              <div key={a.id} className="card paddl-in flex items-start gap-3 p-3">
                <div className="text-3xl leading-none">{a.emoji}</div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">{a.title}</div>
                  <div className="font-extrabold break-words">{a.winner}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-soft flex-1" onClick={() => recap(false)} disabled={busy}><Download size={16} /> Save recap card</button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button className="btn-soft flex-1" onClick={() => recap(true)} disabled={busy}><Share2 size={16} /> Share recap</button>
            )}
          </div>
        </section>
      )}

      <div className="sticky top-0 z-10 -mx-4 mt-4 flex gap-2 border-b border-slate-200 bg-slate-100/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <button className="btn-primary flex-1 !min-h-12" onClick={saveAll} disabled={busy}><Download size={18} /> {busy ? 'Creating…' : 'Save images (3)'}</button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button className="btn-soft flex-1 !min-h-12" onClick={shareAll} disabled={busy}><Share2 size={18} /> Share</button>
        )}
      </div>
      {msg && <p className="mt-2 text-sm font-medium text-green-700 dark:text-green-400" role="status">{msg}</p>}

      <p className="mt-4 mb-2 text-xs text-slate-500">Save images creates these three pictures. Tap one to save just that image.</p>
      <div className="space-y-5">
        {PARTS.map((p, i) => (
          <div key={p.id}>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-sm font-bold">{i + 1}. {p.label}</div>
              <button className="btn-soft !min-h-9 !px-3" onClick={() => saveOne(p.id, i + 1)} disabled={busy}><Download size={15} /> Save</button>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800">
              <div className="mx-auto w-fit"><ShareCard ref={(el) => { refs.current[p.id] = el }} s={s} part={p.id} /></div>
            </div>
          </div>
        ))}
      </div>

      <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}><RecapCard ref={recapRef} s={s} /></div>

      <button className="btn-soft mt-6 w-full" onClick={() => updateActive((x) => reopenSession(x))}>
        Ended by mistake? Reopen this session
      </button>
      <button
        className="btn-ghost mt-2 w-full text-red-600"
        onClick={() => { if (confirm('Delete this session and its history for good?')) { removeSession(s.id); onBack() } }}
      >
        <Trash2 size={16} /> Delete this session
      </button>
    </div>
  )
}
