import { useEffect, useState } from 'react'
import { Crown, Maximize2, Minimize2, X } from 'lucide-react'
import type { Session } from '../engine/types'
import { COURT_TAGS } from '../engine/types'
import { previewQueue, waitingUnits } from '../engine/queue'
import { etaText, queueEta, rivalryFor, streakCall } from '../engine/insights'
import { nameOf } from '../engine/stats'
import { elapsed, join, useNow } from '../lib/util'

/**
 * Big-screen "scoreboard and queue board": high contrast, large type, read-only.
 * Prop a tablet near the courts or cast the browser tab to a TV.
 */
export default function Board({ s, onClose }: { s: Session; onClose: () => void }) {
  const now = useNow(15000)
  const [full, setFull] = useState(false)
  const eta = queueEta(s, now)
  const upcoming = previewQueue(s, 4)
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
    }
  }, [onClose])

  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950 p-4 text-white sm:p-6" role="dialog" aria-label="Court board">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold tracking-[0.25em] text-green-400">PADDL · COURT BOARD</div>
            <div className="truncate text-2xl font-extrabold sm:text-4xl">{s.name}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            {document.fullscreenEnabled && (
              <button onClick={toggleFull} className="btn bg-slate-800 text-white hover:bg-slate-700" aria-label={full ? 'Exit full screen' : 'Full screen'}>
                {full ? <Minimize2 size={20} /> : <Maximize2 size={20} />} <span className="hidden sm:inline">{full ? 'Exit' : 'Full screen'}</span>
              </button>
            )}
            <button onClick={onClose} className="btn bg-slate-800 text-white hover:bg-slate-700" aria-label="Close board"><X size={20} /> <span className="hidden sm:inline">Close</span></button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className={`grid gap-4 ${s.courts.length > 1 ? 'md:grid-cols-2' : ''}`}>
            {s.courts.map((c) => {
              const m = c.match
              const call = streakCall(s, c.id)
              const riv = m ? rivalryFor(s, m.a, m.b) : null
              return (
                <section key={c.id} className="flex flex-col overflow-hidden rounded-3xl border-2 border-green-500/60 bg-slate-900">
                  <div className="flex items-center justify-between bg-green-600 px-5 py-3">
                    <h2 className="text-2xl font-extrabold sm:text-3xl">{c.name}</h2>
                    <div className="flex items-center gap-2 text-sm font-semibold text-green-50">
                      {c.tags?.map((t) => <span key={t} className="rounded-full bg-black/25 px-2.5 py-1">{COURT_TAGS[t].emoji} {COURT_TAGS[t].label}</span>)}
                      {m && <span className="tabular-nums">{elapsed(m.startedAt, now)}</span>}
                    </div>
                  </div>
                  {m ? (
                    <div className="flex flex-1 flex-col justify-center gap-3 p-5">
                      <BoardSide s={s} ids={m.a} king={m.streak > 0} />
                      <div className="text-center text-sm font-bold tracking-[0.4em] text-slate-500">VS</div>
                      <BoardSide s={s} ids={m.b} />
                      {call && <div className="flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-lg font-bold text-amber-300"><Crown size={20} /> {call}</div>}
                      {riv && <div className="rounded-xl bg-sky-500/15 px-4 py-2 text-base font-semibold text-sky-300">{riv.text}</div>}
                    </div>
                  ) : (
                    <div className="p-10 text-center text-xl text-slate-400">
                      {c.hold ? `${join(c.hold.ids.map((id) => nameOf(s, id)))} hold the court, waiting for challengers` : 'Waiting for players'}
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          <aside className="space-y-4">
            <section className="rounded-3xl border-2 border-amber-400/60 bg-slate-900 p-5">
              <h2 className="mb-3 text-2xl font-extrabold text-amber-300">ON DECK</h2>
              {upcoming.length === 0 ? (
                <p className="text-lg text-slate-400">{waiting.length === 0 ? 'Everyone is on court.' : 'Waiting for enough players.'}</p>
              ) : (
                <ol className="space-y-3">
                  {upcoming.map((m, i) => {
                    const t = etaText(eta.get(m.a[0]))
                    return (
                      <li key={i} className={`rounded-2xl p-4 ${i === 0 ? 'bg-amber-400/15 ring-2 ring-amber-400/60' : 'bg-slate-800'}`}>
                        <div className="mb-1 flex items-center justify-between text-sm font-bold tracking-wider text-slate-400">
                          <span>{i === 0 ? 'UP NEXT' : `THEN #${i + 1}`}</span>
                          {t && <span className="text-amber-300">{t}</span>}
                        </div>
                        <div className="text-2xl font-extrabold leading-tight">{join(m.a.map((id) => nameOf(s, id)))}</div>
                        {m.b ? (
                          <>
                            <div className="text-xs font-bold tracking-widest text-slate-500">VS</div>
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
              <section className="rounded-3xl bg-slate-900 p-5">
                <h2 className="mb-3 text-lg font-bold tracking-wider text-slate-400">WAITING LINE</h2>
                <div className="flex flex-wrap gap-2">
                  {waiting.map((u) => {
                    const t = etaText(eta.get(u.ids[0]))
                    return (
                      <span key={u.key} className="rounded-full bg-slate-800 px-4 py-2 text-lg font-semibold">
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
    </div>
  )
}

function BoardSide({ s, ids, king }: { s: Session; ids: string[]; king?: boolean }) {
  return (
    <div className={`grid gap-3 ${ids.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {ids.map((id) => (
        <div key={id} className={`truncate rounded-2xl px-4 py-6 text-center text-3xl font-extrabold sm:py-8 sm:text-5xl ${king ? 'bg-amber-400/20 text-amber-200' : 'bg-slate-800'}`}>
          {nameOf(s, id)}
        </div>
      ))}
    </div>
  )
}
