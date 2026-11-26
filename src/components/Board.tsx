import { useEffect, useRef, useState } from 'react'
import { Check, Crown, Maximize2, Minimize2, Undo2, Volume2, VolumeX, X } from 'lucide-react'
import type { Session } from '../engine/types'
import { COURT_TAGS } from '../engine/types'
import { previewQueue, waitingUnits } from '../engine/queue'
import { finishMatch } from '../engine/session'
import { etaText, queueEta, rivalryFor, streakCall } from '../engine/insights'
import { nameOf } from '../engine/stats'
import { setSound, useSound } from '../lib/cues'
import { elapsed, join, useNow } from '../lib/util'
import { undo, updateActive, useData } from '../store'
import { CourtLines, PaddleBall, Vs } from './art'
import VoiceSheet from './VoiceSheet'
import { courtCall, upNextCall } from '../lib/announce'
import { useAnnouncer } from '../lib/useAnnouncer'
import { TIME_MARK_MIN } from '../lib/cues'

/**
 * Big-screen scoreboard and queue board: high contrast, large type. Prop a tablet near the courts or cast the tab
 * to a TV. Tap the winning team on a court to record the result and bring on the next match without leaving.
 */
export default function Board({ s, onClose }: { s: Session; onClose: () => void }) {
  const now = useNow(15000)
  const { undo: undoDepth } = useData()
  const sound = useSound()
  const [full, setFull] = useState(false)
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onFs = () => setFull(!!document.fullscreenElement)
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFs)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      if (timer.current) clearTimeout(timer.current)
    }
  }, [onClose])

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
    const c = s.courts.find((x) => x.id === courtId)
    if (!c?.match) return
    const ids = side === 'a' ? c.match.a : c.match.b
    const gid = c.match.gid
    if (!updateActive((x) => finishMatch(x, courtId, { winner: side, scoreA: null, scoreB: null, expect: gid }))) return // an ignored stale tap
    show(`${join(ids.map((id) => nameOf(s, id)))} won on ${c.name}`)
  }

  function doUndo() {
    undo()
    setToast(null)
  }

  const iconBtn = 'btn border border-white/10 bg-white/5 text-white hover:bg-white/10'

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950 p-4 text-white sm:p-6" role="dialog" aria-label="Court board">
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
          <p className="mb-3 text-sm font-semibold text-slate-300">👆 Tap the winning team to record the result and start the next match.</p>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className={`grid gap-4 ${s.courts.length > 1 ? 'md:grid-cols-2' : ''}`}>
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
                      <BoardTeam s={s} ids={m.a} king={m.streak > 0} onWin={() => win(c.id, 'a')} />
                      <div className="flex justify-center"><Vs big /></div>
                      <BoardTeam s={s} ids={m.b} onWin={() => win(c.id, 'b')} />
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
                  {waiting.map((u) => {
                    const t = etaText(eta.get(u.ids[0]))
                    return (
                      <span key={u.key} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-lg font-semibold">
                        {u.ids.map((id) => nameOf(s, id)).join(' & ')}
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
      {toast && (
        <div key={toast.id} role="status" className="paddl-in fixed inset-x-4 bottom-4 z-[70] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-accent/40 bg-slate-900/95 px-4 py-3 shadow-[0_0_40px_-10px_rgba(182,255,59,0.6)] backdrop-blur-xl">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"><Check size={18} /></span>
          <span className="min-w-0 flex-1 truncate text-base font-bold">🏆 {toast.text}</span>
          <button onClick={doUndo} className="btn-soft !min-h-10 shrink-0 !px-4 !text-white"><Undo2 size={16} /> Undo</button>
        </div>
      )}
    </div>
  )
}

/** One team on a court: the whole block is a single big button that records the win. */
function BoardTeam({ s, ids, king, onWin }: { s: Session; ids: string[]; king?: boolean; onWin: () => void }) {
  const label = join(ids.map((id) => nameOf(s, id)))
  return (
    <button
      onClick={onWin}
      aria-label={`${label} won`}
      className={`group grid w-full gap-2 rounded-2xl border-2 p-2 text-center transition active:scale-[0.985] ${ids.length > 1 ? 'grid-cols-[repeat(2,minmax(0,1fr))]' : 'grid-cols-[minmax(0,1fr)]'} ${
        king ? 'border-amber-400/50 bg-amber-400/10 hover:border-amber-300' : 'border-white/10 bg-white/5 hover:border-accent hover:bg-accent/10'
      }`}
    >
      {ids.map((id) => (
        <span key={id} className={`truncate rounded-xl px-3 py-5 text-3xl font-black tracking-tight sm:py-7 sm:text-5xl ${king ? 'text-amber-200' : 'text-white'}`}>
          {nameOf(s, id)}
        </span>
      ))}
    </button>
  )
}
