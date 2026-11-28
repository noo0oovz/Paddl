import { forwardRef, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronDown, Download, FileSpreadsheet, Share2, Sparkles, Trash2 } from 'lucide-react'
import type { Session } from '../engine/types'
import { nameOf, ordinal, podiumOf, standings, summarize, tieNote } from '../engine/stats'
import { awards, highlightsNotInAwards, awardsByName, type Award } from '../engine/insights'
import { download, fileName, canShareFile, renderPng, shareImage } from '../lib/exportImage'
import { fmtDate, fmtDuration, fmtTime, join, plural } from '../lib/util'
import { reopenSession } from '../engine/session'
import { removeSession, updateActive } from '../store'
import { placeLabels } from './Standings'
import { HistorySection, Highlights, ParticipationSection, Podium, StandingsSection, StatStrip, minutes } from './ResultsView'
import { CourtLines } from './art'
import ThemeSwitch from './ThemeSwitch'
import { useConfirm } from './Confirm'
import { resultsCsv } from '../lib/csv'

const C = { ink: '#0b1121', mute: '#5f6d89', line: '#e2e8f4', soft: '#eef2f9', green: '#3f6b00', lime: '#b6ff3b', dark: '#05070d', cyan: '#22d3ee' }

/** Dark neon header used on every saved picture, so they read as Paddl wherever they are shared. */
const HEADER_BG = `radial-gradient(520px 220px at 0% 0%, rgba(182,255,59,0.28), transparent 60%), radial-gradient(520px 220px at 100% 0%, rgba(34,211,238,0.22), transparent 60%), linear-gradient(135deg, #0b1121, #05070d)`

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
      <div style={{ background: HEADER_BG, color: '#fff', padding: '26px 32px', borderBottom: `3px solid ${C.lime}` }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2.5, color: C.lime }}>PADDL · {title}</div>
        <div style={{ fontSize: 34, fontWeight: 800, marginTop: 6, lineHeight: 1.15 }}>{s.name}</div>
        <div style={{ fontSize: 14, marginTop: 6, opacity: 0.9 }}>
          {fmtDate(s.createdAt)} · {plural(s.players.length, 'player')} · {plural(sum.matches, 'game')} · {fmtDuration(sum.durationMs)}
        </div>
      </div>
      <div style={{ padding: '22px 32px 8px' }}>{children}</div>
      <div style={{ padding: '14px 32px 20px', color: C.mute, fontSize: 12, textAlign: 'center', borderTop: `1px solid ${C.line}`, marginTop: 8 }}>
        Made with Paddl · {fmtTime(s.endedAt ?? Date.now())}
      </div>
    </>
  )
}

/** Session recap picture: podium, the headline numbers, then the awards. Always light, fixed width, for sharing. */
export const RecapCard = forwardRef<HTMLDivElement, { s: Session }>(function RecapCard({ s }, ref) {
  const rows = standings(s)
  const list = awards(s)
  const sum = summarize(s)
  // The same podium as on the screen: everyone in the top three PLACES who has won (a tie for 2nd shows every one of them).
  const podium = podiumOf(rows)
  const classic = podium.length === 3 && podium.every((x, k) => x.place === k + 1)
  const order = classic ? [podium[1], podium[0], podium[2]] : podium
  const heightOf = (place: number) => (place === 1 ? 106 : place === 2 ? 74 : 56)
  const tiles: [string, string, string][] = [
    ['🎾', String(sum.matches), 'GAMES'],
    ['👥', String(s.players.length), 'PLAYERS'],
    ['⏱', fmtDuration(sum.durationMs), 'SESSION'],
    ['🔥', sum.hotStreak ? String(sum.hotStreak.longestStreak) : '–', 'BEST STREAK'],
  ]
  return (
    <div ref={ref} style={{ width: 720, background: '#ffffff', color: C.ink, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ background: HEADER_BG, color: '#fff', padding: '28px 32px 24px', borderBottom: `3px solid ${C.lime}` }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2.5, color: C.lime }}>PADDL · SESSION RECAP</div>
        <div style={{ fontSize: 36, fontWeight: 800, marginTop: 6, lineHeight: 1.15 }}>{s.name}</div>
        <div style={{ fontSize: 14, marginTop: 6, opacity: 0.9 }}>{fmtDate(s.createdAt)}</div>
      </div>

      <div style={{ padding: '24px 32px 0' }}>
        {podium.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(order.length, 5)}, minmax(0, 1fr))`, gap: 10, alignItems: 'end', borderBottom: `3px solid ${C.lime}`, background: 'linear-gradient(180deg, rgba(182,255,59,0.14), rgba(182,255,59,0))', borderRadius: '16px 16px 0 0', padding: '16px 10px 0' }}>
            {order.map(({ row: p, place: pl }) => {
              const i = pl - 1 // 0 = first place; everyone tied for a place shares it
              return (
                <div key={p.id} style={{ textAlign: 'center', minWidth: 0 }}>
                  <div style={{ fontSize: i === 0 ? 40 : 32, lineHeight: 1.1 }}>{i === 0 ? '👑' : i === 1 ? '🥈' : '🥉'}</div>
                  <div style={{ fontSize: i === 0 ? 20 : order.length > 3 ? 14 : 16, fontWeight: 800, marginTop: 4, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: C.mute, marginTop: 2, fontWeight: 600 }}>{p.wins}W · {p.losses}L</div>
                  <div style={{ fontSize: 11, color: i === 0 ? C.green : C.mute, margin: '1px 0 8px', fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' }}>{podium.filter((x) => x.place === pl).length > 1 ? (pl === 1 ? 'Co-champion' : `Tied ${ordinal(pl)}`) : pl === 1 ? 'Champion' : ordinal(pl)}</div>
                  <div style={{ height: heightOf(pl), borderRadius: '14px 14px 0 0', border: `1px solid ${i === 0 ? 'rgba(120,190,20,0.5)' : C.line}`, borderBottom: 'none', background: i === 0 ? 'linear-gradient(180deg, rgba(182,255,59,0.4), rgba(182,255,59,0.08))' : C.soft, color: i === 0 ? C.green : C.mute, fontSize: 26, fontWeight: 900, paddingTop: 8 }}>{pl}</div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
          {tiles.map(([e, v, l]) => (
            <div key={l} style={{ background: C.soft, borderRadius: 14, padding: '12px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, lineHeight: 1.2 }}>{e}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2, lineHeight: 1.2 }}>{v}</div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.4, color: C.mute, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '22px 32px 6px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: C.mute, marginBottom: 10 }}>SESSION AWARDS</div>
        {list.length === 0 && <div style={{ color: C.mute, fontSize: 15, padding: '8px 0 16px' }}>Play a few games and the awards will show up here.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {list.map((a, i) => (
            <div key={a.id} style={{ background: C.soft, borderRadius: 16, padding: '14px 16px', minWidth: 0, gridColumn: list.length % 2 === 1 && i === list.length - 1 ? '1 / -1' : undefined }}>
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
  const labels = placeLabels(rows)
  // the awards card already shows Dynamic Duo and On Fire, so this card only adds what they do not say
  const extra = highlightsNotInAwards(s)
  const badges = awardsByName(s)
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
                  <th style={{ textAlign: 'left', padding: '4px 6px', width: 56 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>PLAYER</th>
                  <th style={{ padding: '4px 6px' }}>W</th>
                  <th style={{ padding: '4px 6px' }}>L</th>
                  <th style={{ padding: '4px 6px' }}>WIN %</th>
                  <th style={{ padding: '4px 6px' }}>{rows.some((r) => r.pf + r.pa > 0) ? '+/−' : 'AWARDS'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.line}`, background: i === 0 && r.wins > 0 ? '#fffbeb' : undefined, textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 800, whiteSpace: 'nowrap' }}>{labels[i]}</td>
                    <td style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700 }}>{r.name}</td>
                    <td style={{ padding: '8px 6px' }}>{r.wins}</td>
                    <td style={{ padding: '8px 6px' }}>{r.losses}</td>
                    <td style={{ padding: '8px 6px' }}>{r.wins + r.losses ? `${Math.round(r.winPct * 100)}%` : '–'}</td>
                    {rows.some((x) => x.pf + x.pa > 0) ? (
                      <td style={{ padding: '8px 6px', color: r.diff > 0 ? C.green : r.diff < 0 ? '#dc2626' : C.mute, fontWeight: 600 }}>{r.pf + r.pa ? (r.diff > 0 ? `+${r.diff}` : r.diff) : '–'}</td>
                    ) : (
                      <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{(badges.get(r.name) ?? []).map((a) => a.emoji).join(' ')}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {tieNote(rows) && <div style={{ paddingTop: 10, fontSize: 12, color: C.mute }}>{tieNote(rows)}</div>}
            {(extra.length > 0 || sum.biggestWin) && (
              <div style={{ paddingTop: 18, display: 'flex', gap: 10 }}>
                {extra.map((h) => <Fact key={h.key} label={h.label.toUpperCase()} value={h.value} sub={h.sub} />)}
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
                  <div style={{ width: `${(r.played / maxPlayed) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${C.green}, #7fcb00)` }} />
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
      <div style={{ fontSize: 12, color: C.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
    </div>
  )
}

function partFile(s: Session, part: Part, n: number): string {
  return fileName(s.name).replace(/\.png$/, `-${n}-${part}.png`)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function Summary({ s, onBack }: { s: Session; onBack: () => void }) {
  const refs = useRef<Record<Part, HTMLDivElement | null>>({ standings: null, participation: null, history: null })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const recapAwards: Award[] = awards(s)

  async function makeOne(part: Part): Promise<Blob> {
    const node = refs.current[part]
    if (!node) throw new Error('missing card')
    return renderPng(node)
  }

  const recapRef = useRef<HTMLDivElement>(null)
  const hasAwards = recapAwards.length > 0
  const pictureCount = PARTS.length + (hasAwards ? 1 : 0)

  /** Every picture to share: standings, games played, match history, and the awards card when there are awards. */
  async function makeAll(): Promise<{ blob: Blob; name: string }[] | null> {
    setBusy(true)
    setMsg(null)
    try {
      const out: { blob: Blob; name: string }[] = []
      for (const [i, p] of PARTS.entries()) out.push({ blob: await makeOne(p.id), name: partFile(s, p.id, i + 1) })
      if (hasAwards && recapRef.current) out.push({ blob: await renderPng(recapRef.current), name: fileName(s.name).replace(/.png$/, `-${PARTS.length + 1}-awards.png`) })
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
    setMsg(`Saved ${all.length} images.`)
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
    setMsg(`Sharing is not available here, so the ${all.length} images were saved instead.`)
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

  const rows = standings(s)
  const [preview, setPreview] = useState(false)
  const { ask, dialog } = useConfirm()

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-10">
      {dialog}
      <div className="mb-2 flex items-center justify-between">
        <button className="btn-ghost -ml-3" onClick={onBack}><ArrowLeft size={18} /> Back</button>
        <ThemeSwitch />
      </div>

      <header className="card relative overflow-hidden px-5 pt-6 pb-5">
        <CourtLines className="pointer-events-none absolute -right-24 -top-10 w-60 text-slate-400/10 [mask-image:linear-gradient(to_left,#000,transparent_85%)] dark:text-accent/[0.08]" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs font-black tracking-[0.25em] text-brand"><span className="live-dot" /> FINAL RESULTS</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{s.name}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{fmtDate(s.createdAt)}</p>
        </div>
      </header>

      <Podium rows={rows} />
      <StatStrip s={s} />

      {recapAwards.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-black tracking-tight"><Sparkles size={18} className="text-amber-400" /> Session awards</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {recapAwards.map((a) => (
              <div key={a.id} className="card paddl-in relative flex items-start gap-3 overflow-hidden p-3">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent/70" />
                <div className="pl-1 text-3xl leading-none">{a.emoji}</div>
                <div className="min-w-0">
                  <div className="text-xs font-black tracking-wider text-slate-500 uppercase dark:text-slate-400">{a.title}</div>
                  <div className="font-black break-words">{a.winner}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Highlights s={s} />
      <StandingsSection s={s} />
      <ParticipationSection s={s} />
      <HistorySection s={s} />

      {/* Share panel: the saved pictures are made from this same data. */}
      <section className="card relative mt-6 overflow-hidden p-4">
        <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent shadow-[0_0_14px_rgba(182,255,59,0.9)]" />
        <h2 className="flex items-center gap-2 text-lg font-black tracking-tight">📸 Share the results</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Save pictures for the group chat: standings, games played, match history and the awards.</p>
        <div className="mt-3 flex gap-2">
          <button className="btn-primary flex-1 !min-h-12" onClick={saveAll} disabled={busy}><Download size={18} /> {busy ? 'Creating…' : `Save images (${pictureCount})`}</button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button className="btn-soft flex-1 !min-h-12" onClick={shareAll} disabled={busy}><Share2 size={18} /> Share</button>
          )}
        </div>
        <button
          className="btn-ghost mt-2 w-full"
          onClick={() => { download(new Blob([resultsCsv(s)], { type: 'text/csv;charset=utf-8' }), fileName(s.name).replace(/.png$/, '.csv')); setMsg('Spreadsheet saved (opens in Excel, Numbers or Google Sheets).') }}
        >
          <FileSpreadsheet size={16} /> Download as spreadsheet (CSV)
        </button>
        {msg && <p className="mt-3 text-sm font-semibold text-brand" role="status">{msg}</p>}

        <button className="mt-3 flex min-h-11 w-full items-center justify-between text-left text-sm font-semibold text-slate-500 dark:text-slate-400" onClick={() => setPreview((v) => !v)} aria-expanded={preview}>
          <span>Preview the pictures</span>
          <ChevronDown size={16} className={`transition ${preview ? 'rotate-180' : ''}`} />
        </button>
      </section>

      {/* The pictures are always rendered (so saving works) but only shown on request; saved images stay light and unchanged. */}
      <div className={preview ? 'mt-3 space-y-5' : 'sr-only'} aria-hidden={!preview}>
        {PARTS.map((p, i) => (
          <div key={p.id}>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-sm font-bold">{i + 1}. {p.label}</div>
              <button className="btn-soft !min-h-9 !px-3" onClick={() => saveOne(p.id, i + 1)} disabled={busy}><Download size={15} /> Save</button>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm dark:border-white/10">
              <div className="mx-auto w-fit"><ShareCard ref={(el) => { refs.current[p.id] = el }} s={s} part={p.id} /></div>
            </div>
          </div>
        ))}
      </div>

      <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}><RecapCard ref={recapRef} s={s} /></div>

      <div className="mt-8 space-y-2">
        <button className="btn-soft w-full" onClick={() => updateActive((x) => reopenSession(x))}>↩️ Ended by mistake? Reopen this session</button>
        <button
          className="btn-ghost w-full text-red-600"
          onClick={() => ask({ title: 'Delete this session?', body: 'Its results and match history are removed for good. This cannot be undone.', confirmLabel: 'Delete it', danger: true, onConfirm: () => { removeSession(s.id); onBack() } })}
        >
          <Trash2 size={16} /> Delete this session
        </button>
      </div>
    </div>
  )
}
