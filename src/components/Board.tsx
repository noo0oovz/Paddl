import { useEffect, useRef, useState } from 'react'
import { Check, Crown, Lock, LockOpen, Maximize2, Minimize2, Undo2, Volume2, VolumeX, X } from 'lucide-react'
import type { Session } from '../engine/types'
import { COURT_TAGS } from '../engine/types'
import { previewQueue, waitingUnits } from '../engine/queue'
import { finishMatch } from '../engine/session'
import { etaText, groupWaitMs, longestWait, queueEta, rivalryFor, streakCall, waitText } from '../engine/insights'
import { nameOf } from '../engine/stats'
import { setSound, useSound } from '../lib/cues'
import { buzz } from '../lib/haptics'
import { elapsed, gameIsArmed, join, useNow } from '../lib/util'
import { undo, updateActive, useData } from '../store'
import { CourtLines, PaddleBall, Vs } from './art'
import VoiceSheet from './VoiceSheet'
import BoardCourt from './BoardCourt'
import { courtCall, upNextCall } from '../lib/announce'
import { useAnnouncer } from '../lib/useAnnouncer'
import { useDialog } from '../lib/dialogStack'
import { TIME_MARK_MIN } from '../lib/cues'

/**
 * Big-screen scoreboard and queue board: high contrast, large type. Prop a tablet near the courts or cast the tab
 * to a TV. Tap the winning team on a court to record the result and bring on the next match without leaving.
 */
export default function Board({ s, onClose }: { s: Session; onClose: () => void }) {
  const now = useNow(5000)
  const { undo: undoDepth } = useData()
  const sound = useSound()
  const [full, setFull] = useState(false)
  // Locked: a bystander or a child cannot record a result by touching the screen. It only lives while the Board is
  // open, so reloading always starts unlocked and nobody can be shut out of their own session.
  const [locked, setLocked] = useState(false)
  const [hold, setHold] = useState(0) // 0-1: how far the press-and-hold to unlock has got
  const holdRaf = useRef<number | null>(null)
  const [nudge, setNudge] = useState(false)
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const upcoming = previewQueue(s, 4)
  const contexts: Record<string, string> = Object.fromEntries([
    ...s.courts.map((c) => [c.id, c.match ? String(c.match.gid ?? c.match.startedAt) : 'idle']),
    ['next', upcoming[0] ? [...upcoming[0].a, ...(upcoming[0].b ?? [])].join() : 'none'],
  ])
  const { speakingId, announce: speakNow } = useAnnouncer(contexts)
  const announce = (id: string, text: string) => { speakNow(id, text) }
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eta = queueEta(s, now)
  const waiting = waitingUnits(s)
  const longest = longestWait(s, waiting.map((u) => u.ids), now)

  const boardRef = useRef<HTMLDivElement>(null)

  // The page behind the Board is locked while it is open, so a swipe always scrolls the Board.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prev = { h: html.style.overflow, b: body.style.overflow }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => { html.style.overflow = prev.h; body.style.overflow = prev.b }
  }, [])

  // Turning the tablet changes the visible height. Re-measure, and keep the scroll position inside the new range,
  // so the Board is never left stuck at a position it can no longer scroll from.
  useEffect(() => {
    const fix = () => {
      const el = boardRef.current
      if (!el) return
      el.style.height = window.innerHeight + 'px'
      requestAnimationFrame(() => {
        el.style.height = '100dvh'
        el.scrollTop = Math.min(el.scrollTop, Math.max(0, el.scrollHeight - el.clientHeight))
      })
    }
    window.addEventListener('resize', fix)
    window.addEventListener('orientationchange', fix)
    window.visualViewport?.addEventListener('resize', fix)
    return () => {
      window.removeEventListener('resize', fix)
      window.removeEventListener('orientationchange', fix)
      window.visualViewport?.removeEventListener('resize', fix)
    }
  }, [])

  // Escape, focus-in, Tab trapping and focus-back are shared with the sheets (useDialog keeps the latest onClose in a ref).
  useDialog(boardRef, onClose)
  // This effect must run ONCE for as long as the Board is open. The parent hands in a new onClose on every render (every
  // game, every clock tick), so if this depended on it, its cleanup would run each time: it would leave full screen and
  // cancel the result toast's timer, so the Board dropped out of full screen after every win and the toast never went away.
  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  function show(text: string) {
    if (timer.current) clearTimeout(timer.current)
    setToast({ text, id: Date.now() })
    timer.current = setTimeout(() => setToast(null), 6000)
  }

  /** Record the win for one side of a court. The court refills from the queue straight away. */
  function win(courtId: string, side: 'a' | 'b') {
    if (locked) { // say why nothing happened, so it never looks broken
      setNudge(true)
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current)
      nudgeTimer.current = setTimeout(() => setNudge(false), 2500)
      return
    }
    const c = s.courts.find((x) => x.id === courtId)
    if (!c?.match) return
    if (!gameIsArmed(c.match.startedAt)) return // a double tap landing on the game that has just started
    const ids = side === 'a' ? c.match.a : c.match.b
    const gid = c.match.gid
    if (!updateActive((x) => finishMatch(x, courtId, { winner: side, scoreA: null, scoreB: null, expect: gid }))) return // an ignored stale tap
    buzz('win')
    show(`${join(ids.map((id) => nameOf(s, id)))} won on ${c.name}`)
  }

  /** Unlock takes a deliberate press and hold (about a second), so a stray touch cannot undo the lock. */
  function startHold() {
    const t0 = performance.now()
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / 1000)
      setHold(p)
      if (p >= 1) { holdRaf.current = null; setLocked(false); setHold(0); return }
      holdRaf.current = requestAnimationFrame(tick)
    }
    holdRaf.current = requestAnimationFrame(tick)
  }
  function cancelHold() {
    if (holdRaf.current) cancelAnimationFrame(holdRaf.current)
    holdRaf.current = null
    setHold(0)
  }
  useEffect(() => () => { if (holdRaf.current) cancelAnimationFrame(holdRaf.current); if (nudgeTimer.current) clearTimeout(nudgeTimer.current) }, [])

  function doUndo() {
    if (undo()) buzz('undo')
    setToast(null)
  }

  const iconBtn = 'btn border border-white/10 bg-white/5 text-white hover:bg-white/10'

  return (
    <div ref={boardRef} className="board-scroll fixed inset-x-0 top-0 z-[60] overflow-y-auto overscroll-contain bg-slate-950 p-4 text-white sm:p-6" style={{ height: '100dvh', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }} role="dialog" aria-modal="true" aria-label="Court board">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(50rem_30rem_at_10%_-10%,rgba(182,255,59,0.12),transparent_60%),radial-gradient(50rem_30rem_at_100%_0%,rgba(34,211,238,0.12),transparent_60%)]" />
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold tracking-[0.25em] text-accent"><span className="live-dot" /> PADDL · LIVE BOARD</div>
            <div className="truncate text-2xl font-black tracking-tight sm:text-4xl">{s.name}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={doUndo} disabled={!undoDepth} className={iconBtn} aria-label="Undo last action" title="Undo"><Undo2 size={20} /> <span className="hidden sm:inline">Undo</span></button>
            <button onClick={() => setSound(!sound)} className={iconBtn} aria-pressed={sound} aria-label={sound ? 'Mute chimes' : 'Turn chimes on'} title="Chimes (the beep when a game starts)">
              {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            {locked ? (
              <button
                onPointerDown={startHold} onPointerUp={cancelHold} onPointerLeave={cancelHold} onPointerCancel={cancelHold} onBlur={cancelHold}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); startHold() } }} onKeyUp={cancelHold}
                className="btn relative overflow-hidden border border-amber-400/60 bg-amber-400/15 text-amber-200 select-none" style={{ touchAction: 'none' }}
                aria-label="Locked. Press and hold to unlock" aria-pressed title="Locked: taps on winners are ignored. Press and hold to unlock."
              >
                <span aria-hidden className="absolute inset-y-0 left-0 bg-amber-400/40" style={{ width: `${hold * 100}%` }} />
                <Lock size={20} className="relative" /> <span className="relative">Hold to unlock</span>
              </button>
            ) : (
              <button onClick={() => setLocked(true)} className={iconBtn} aria-label="Lock the board" title="Lock: ignore taps on winners (for a tablet others can touch)"><LockOpen size={20} /> <span className="hidden sm:inline">Lock</span></button>
            )}
            <button onClick={() => setVoiceOpen(true)} className={iconBtn} aria-label="Announcer voice settings" title="Choose the announcer voice"><Volume2 size={20} /> <span className="hidden sm:inline">Voice</span></button>
            {document.fullscreenEnabled && (
              <button onClick={toggleFull} className={iconBtn} aria-label={full ? 'Exit full screen' : 'Full screen'}>
                {full ? <Minimize2 size={20} /> : <Maximize2 size={20} />} <span className="hidden sm:inline">{full ? 'Exit' : 'Full screen'}</span>
              </button>
            )}
            <button onClick={onClose} className={iconBtn} aria-label="Close board"><X size={20} /> <span className="hidden sm:inline">Close</span></button>
          </div>
        </div>

        {s.courts.some((c) => c.match) && (
          <p className={`mb-3 text-sm font-semibold ${locked ? 'text-amber-300' : 'text-slate-300'}`}>{locked ? '🔒 Locked: touching a team does nothing. Press and hold the lock button to unlock.' : '👆 Tap the winning team to record the result and start the next match.'}</p>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className={`grid grid-cols-[minmax(0,1fr)] gap-4 ${s.courts.length > 1 ? 'md:grid-cols-[repeat(2,minmax(0,1fr))]' : ''}`}>
            {s.courts.map((c) => {
              const m = c.match
              const call = streakCall(s, c.id)
              const riv = m ? rivalryFor(s, m.a, m.b) : null
              const mins = m ? Math.max(0, now - m.startedAt) / 60000 : 0
              const pct = m ? Math.min(100, (mins / TIME_MARK_MIN) * 100) : 100
              const barColor = !m ? 'bg-slate-700' : mins >= TIME_MARK_MIN ? 'bg-red-600' : mins >= 10 ? 'bg-amber-400' : 'bg-accent'
              return (
                <section key={`${c.id}:${m ? m.startedAt : 'idle'}`} className="paddl-in court-new relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-md">
                  <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-3">
                    <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-white/10" />
                    <span aria-hidden title={m ? `${Math.floor(mins)} min on court` : undefined} className={`absolute top-0 left-0 h-1.5 transition-[width] duration-1000 ${barColor}`} style={{ width: `${pct}%` }} />
                    <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl"><PaddleBall size={30} glow={false} /> {c.name}</h2>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                      {c.tags?.map((t) => <span key={t} className="rounded-full bg-white/10 px-2.5 py-1">{COURT_TAGS[t].emoji} {COURT_TAGS[t].label}</span>)}
                      {m && <span className="tabular-nums">⏱ {elapsed(m.startedAt, now)}</span>}
                    </div>
                  </div>
                  {m ? (
                    <div className="flex flex-1 flex-col justify-center gap-2 p-4 sm:p-5">
                      <BoardCourt
                        label={`${c.name}: ${join(m.a.map((id) => nameOf(s, id)))} versus ${join(m.b.map((id) => nameOf(s, id)))}`}
                        a={{ names: m.a.map((id) => nameOf(s, id)), label: join(m.a.map((id) => nameOf(s, id))) }}
                        b={{ names: m.b.map((id) => nameOf(s, id)), label: join(m.b.map((id) => nameOf(s, id))) }}
                        king={m.streak > 0}
                        locked={locked}
                        onWinA={() => win(c.id, 'a')}
                        onWinB={() => win(c.id, 'b')}
                      />
                      <button
                        onClick={() => announce(c.id, courtCall(c.name, m.a.map((id) => nameOf(s, id)), m.b.map((id) => nameOf(s, id))))}
                        aria-label={speakingId === c.id ? `Stop announcing ${c.name}` : `Call out ${c.name}`}
                        aria-pressed={speakingId === c.id}
                        className={`btn border border-white/10 bg-white/5 text-white hover:bg-white/10 ${speakingId === c.id ? 'speaking-pulse !border-accent !bg-accent/15 !text-accent' : ''}`}
                      >
                        <Volume2 size={20} /> {speakingId === c.id ? 'Calling out… tap to stop' : 'Call out this court'}
                      </button>
                      {call && <div className="flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-lg font-bold text-amber-300"><Crown size={20} /> {call}</div>}
                      {riv && <div className="rounded-xl bg-sky-500/15 px-4 py-2 text-base font-semibold text-sky-300">{riv.text}</div>}
                    </div>
                  ) : (
                    <div className="relative p-10 text-center text-xl text-slate-400">
                      <CourtLines className="pointer-events-none absolute inset-0 m-auto w-4/5 text-white/10" />
                      <span className="relative">{c.hold ? `${join(c.hold.ids.map((id) => nameOf(s, id)))} hold the court, waiting for challengers` : '⏳ Waiting for players'}</span>
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-amber-400/40 bg-amber-400/[0.04] p-5 shadow-[0_0_40px_-18px_rgba(255,194,51,0.6)]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-2xl font-black tracking-tight text-amber-300">⏭ ON DECK</h2>
                {upcoming[0] && (
                  <button
                    onClick={() => announce('next', upNextCall(upcoming[0].a.map((id) => nameOf(s, id)), upcoming[0].b ? upcoming[0].b.map((id) => nameOf(s, id)) : null))}
                    aria-label={speakingId === 'next' ? 'Stop announcing the next match' : 'Call out the next match'}
                    aria-pressed={speakingId === 'next'}
                    className={`btn border border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20 ${speakingId === 'next' ? 'speaking-pulse !border-accent !bg-accent/15 !text-accent' : ''}`}
                  >
                    <Volume2 size={20} /> {speakingId === 'next' ? 'Stop' : 'Call out'}
                  </button>
                )}
              </div>
              {s.config.mode === 'mystery' && <p className="-mt-2 mb-3 text-sm font-semibold text-amber-200/80">Mystery mix: teams are a surprise when the game starts.</p>}
              {upcoming.length === 0 ? (
                <p className="text-lg text-slate-400">{waiting.length === 0 ? '✅ Everyone is on court.' : 'Waiting for enough players.'}</p>
              ) : (
                <ol className="space-y-3">
                  {upcoming.map((m, i) => {
                    const t = etaText(eta.get(m.a[0]))
                    return (
                      <li key={i} className={`rounded-2xl p-4 ${i === 0 ? 'bg-amber-400/15 ring-2 ring-amber-400/60' : 'bg-white/5'}`}>
                        <div className="mb-1 flex items-center justify-between text-sm font-bold tracking-wider text-slate-400">
                          <span>{i === 0 ? 'UP NEXT' : `THEN #${i + 1}`}</span>
                          {t && <span className="text-amber-300">⏱ {t}</span>}
                        </div>
                        <div className="text-2xl font-extrabold leading-tight">{join(m.a.map((id) => nameOf(s, id)))}</div>
                        {m.b ? (
                          <>
                            <div className="my-1 flex"><Vs /></div>
                            <div className="text-2xl font-extrabold leading-tight">{join(m.b.map((id) => nameOf(s, id)))}</div>
                          </>
                        ) : (
                          <div className="text-base text-slate-400">challenging the winners</div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>

            {waiting.length > 0 && (
              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <h2 className="mb-3 text-lg font-bold tracking-wider text-slate-400">🕘 WAITING LINE</h2>
                <div className="flex flex-wrap gap-2">
                  {waiting.map((u, i) => {
                    const t = etaText(eta.get(u.ids[0]))
                    const w = waitText(groupWaitMs(s, u.ids, now))
                    return (
                      <span key={u.key} className={`rounded-full border px-4 py-2 text-lg font-semibold ${longest?.index === i ? 'border-accent/70 bg-accent/10' : 'border-white/10 bg-white/5'}`}>
                        {u.ids.map((id) => nameOf(s, id)).join(' & ')}
                        {w && <span className="ml-2 text-sm font-medium text-slate-300">{w}</span>}
                        {t && <span className="ml-2 text-sm font-medium text-slate-400">{t}</span>}
                      </span>
                    )
                  })}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>

      {voiceOpen && <VoiceSheet onClose={() => setVoiceOpen(false)} />}
      {nudge && (
        <div role="status" className="paddl-in fixed inset-x-4 bottom-4 z-[70] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-amber-400/50 bg-slate-900/95 px-4 py-3 text-amber-200 backdrop-blur-xl">
          <Lock size={20} className="shrink-0" /> <span className="text-base font-bold">The board is locked. Press and hold the lock button to unlock it.</span>
        </div>
      )}
      {toast && (
        <div key={toast.id} role="status" className="paddl-in fixed inset-x-4 bottom-4 z-[70] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-accent/40 bg-slate-900/95 px-4 py-3 shadow-[0_0_40px_-10px_rgba(182,255,59,0.6)] backdrop-blur-xl">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"><Check size={18} /></span>
          <span className="min-w-0 flex-1 truncate text-base font-bold">🏆 {toast.text}</span>
          <button onClick={doUndo} className="btn-toast !min-h-10 shrink-0 !px-4"><Undo2 size={16} /> Undo</button>
        </div>
      )}
    </div>
  )
}
