import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, Megaphone, Settings2, Trash2, ArrowUpToLine, Ban, Clock, Crown, LogIn, LogOut, Moon, Monitor, Plus, Repeat2, Shuffle, Trophy, Undo2, UserPlus, Users, Volume2, VolumeX } from 'lucide-react'
import { COURT_TAGS, type Court, type CourtTag, type Session } from '../engine/types'
import { previewQueue, waitingUnits, unitsNeeded } from '../engine/queue'
import { countMatches, playedOf, nameOf } from '../engine/stats'
import { etaIn, etaText, queueEta, rivalryFor, streakCall } from '../engine/insights'
import { TIME_MARK_MIN, chime, setSound, useSound } from '../lib/cues'
import Board from './Board'
import { useConfirm } from './Confirm'
import { HalfCourt, Vs } from './art'
import {
  addCourt, addPlayer, addTeam, cancelMatch, clearPriority, finishMatch, playNext, pullOut, remixCourt, remixNext, renamePlayer, sendBack, planCourtRemoval, removeCourt, MAX_COURTS, setLevel,
  setStatus, substitute, swapOutOfNext, toggleCourtTag, nameTaken, isKing, type Result,
} from '../engine/session'
import { validateScore } from '../engine/validate'
import { changeCount, undoIfUnchanged, updateActive } from '../store'
import { buzz } from '../lib/haptics'
import { elapsed, gameIsArmed, isEnter, join, plural, useNow } from '../lib/util'
import { Empty, Sheet } from './ui'
import VoiceSheet from './VoiceSheet'
import { courtCall, upNextCall } from '../lib/announce'
import { useAnnouncer } from '../lib/useAnnouncer'
import { hintsSeen, markHintsSeen } from '../lib/hints'

export default function Live({ s }: { s: Session }) {
  const now = useNow()
  const [scoring, setScoring] = useState<string | null>(null)
  const [people, setPeople] = useState(false)
  const [adding, setAdding] = useState(false)
  const [subFor, setSubFor] = useState<{ court: string; id: string } | null>(null)
  const [waitFor, setWaitFor] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The toast offered after a result is recorded, so a mis-tap can be taken back right where it happened.
  const [won, setWon] = useState<{ text: string; id: number; at: number } | null>(null)
  const wonTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [board, setBoard] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  // What each call-out is about: the game on that court (or the upcoming match). It stops if that changes.
  const nextUp = previewQueue(s, 1)[0]
  const contexts: Record<string, string> = Object.fromEntries([
    ...s.courts.map((c) => [c.id, c.match ? String(c.match.gid ?? c.match.startedAt) : 'idle']),
    ['next', nextUp ? [...nextUp.a, ...(nextUp.b ?? [])].join() : 'none'],
  ])
  const { speakingId, announce: speakNow } = useAnnouncer(contexts)
  function announce(id: string, text: string) {
    if (!speakNow(id, text)) flash('This browser cannot speak out loud. Try Chrome or Safari.')
  }
  const [tagFor, setTagFor] = useState<string | null>(null)
  const sound = useSound()

  // Cues: a chime when a new match is locked in on a court, and a ping when a court hits the time mark.
  const startedKey = s.courts.map((c) => (c.match ? c.match.startedAt : 0)).join(',')
  const lastStarted = useRef(startedKey)
  useEffect(() => {
    if (lastStarted.current !== startedKey && s.courts.some((c) => c.match && Date.now() - c.match.startedAt < 4000)) chime('match')
    lastStarted.current = startedKey
  }, [startedKey, s.courts])
  const pinged = useRef<Set<number>>(new Set())
  useEffect(() => {
    for (const c of s.courts) {
      const st = c.match?.startedAt
      if (st && !pinged.current.has(st) && now - st >= TIME_MARK_MIN * 60000) {
        pinged.current.add(st)
        chime('timer')
      }
    }
  }, [now, s.courts])

  function flash(msg: string) {
    if (noteTimer.current) clearTimeout(noteTimer.current)
    setNote(msg)
    noteTimer.current = setTimeout(() => setNote(null), 3500)
  }

  /** A result was recorded: show who won with an Undo button next to it (the same as on the Board). */
  function showWon(text: string) {
    if (wonTimer.current) clearTimeout(wonTimer.current)
    // changeCount() is read AFTER the result was saved, so it names exactly that change.
    setWon({ text, id: Date.now(), at: changeCount() })
    wonTimer.current = setTimeout(() => setWon(null), 6000)
  }
  useEffect(() => () => { if (noteTimer.current) clearTimeout(noteTimer.current); if (wonTimer.current) clearTimeout(wonTimer.current) }, [])
  // The toast says "Undo this result", so it must only stay while that result is still the latest thing that happened.
  useEffect(() => {
    if (won && changeCount() !== won.at) setWon(null)
  }, [s, won])

  /** Run a remix; tell the host when no different match-up was possible. */
  function remix(fn: (x: Session) => Session, what: string) {
    const changed = fn(s) !== s
    if (changed) updateActive(fn)
    flash(changed ? `${what} redrawn.` : `No different match-up is possible for ${what.toLowerCase()} with the players waiting. To mix more, tap Reshuffle on a court game, or add a player.`)
  }

  /** One tap: send a player out of the next match to the back of the line; the next in line steps up. */
  function swapNext(id: string) {
    const changed = swapOutOfNext(s, id) !== s
    if (changed) updateActive((x) => swapOutOfNext(x, id))
    flash(changed ? `${nameOf(s, id)} sent to the back. Next in line steps up.` : 'Nobody else is waiting to take that spot.')
  }

  const counts = countMatches(s.matches)
  const waiting = waitingUnits(s)
  const waitingPlayers = waiting.reduce((n, u) => n + u.ids.length, 0)
  const need = unitsNeeded(s.config.format)
  const upcoming = previewQueue(s, 4)
  const eta = queueEta(s, now)
  const resting = s.players.filter((p) => p.status === 'resting')
  const freeCourts = s.courts.filter((c) => !c.match).length

  const court = s.courts.find((c) => c.id === scoring)

  // First-time tips go away once the host has recorded a game (they stay in Help).
  const showHints = !hintsSeen() && s.matches.length === 0
  useEffect(() => { if (s.matches.length > 0) markHintsSeen() }, [s.matches.length])

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="w-full min-w-0 text-sm text-slate-500 sm:w-auto dark:text-slate-400">
          {s.matches.length} {s.matches.length === 1 ? 'game' : 'games'} played · {s.players.filter((p) => p.status === 'active').length} playing
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-soft !min-h-10 !px-3" onClick={() => setVoiceOpen(true)} aria-label="Announcer voice settings" title="Choose the announcer voice"><Megaphone size={18} /></button>
          <button className="btn-soft !min-h-10 !px-3" onClick={() => setSound(!sound)} aria-pressed={sound} aria-label={sound ? 'Mute chimes' : 'Turn chimes on'} title={sound ? 'Chimes on (tap to mute). This is the beep when a game starts; use the Call out buttons to announce players.' : 'Chimes off (tap to turn on)'}>
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button className="btn-soft !min-h-10" onClick={() => setBoard(true)} title="Big-screen board for a tablet or TV"><Monitor size={18} /> <span className="hidden min-[420px]:inline">Board</span></button>
          <button className="btn-primary !min-h-10" onClick={() => setAdding(true)} aria-label={s.config.format === 'teams' ? 'Add a late team' : 'Add a late player'} title="Someone just arrived? Add them without ending the session"><UserPlus size={18} /> <span className="hidden min-[360px]:inline">{s.config.format === 'teams' ? 'Add team' : 'Add'}</span></button>
          <button className="btn-soft !min-h-10" onClick={() => setPeople(true)} title="Breaks, renames and who has left"><Users size={18} /> <span className="hidden min-[420px]:inline">Players</span></button>
        </div>
      </div>

      {nextUp && (
        <button
          type="button"
          onClick={() => document.getElementById('next-match')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className="sticky top-14 z-10 mb-3 flex w-full items-center gap-2 rounded-xl border border-accent/30 bg-white/90 px-3 py-2 text-left text-sm shadow-sm backdrop-blur lg:hidden dark:bg-slate-950/90"
          aria-label="Show the next match"
        >
          <span className="shrink-0 text-xs font-extrabold tracking-wide text-brand uppercase">Up next</span>
          <span className="min-w-0 flex-1 leading-snug font-semibold [overflow-wrap:anywhere]">
            {join(nextUp.a.map((id) => nameOf(s, id)))}{nextUp.b ? ` vs ${join(nextUp.b.map((id) => nameOf(s, id)))}` : ' challenge the winners'}
            {etaText(eta.get(nextUp.a[0])) && <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{etaText(eta.get(nextUp.a[0]))}</span>}
          </span>
        </button>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {note && <div role="status" className="rounded-xl bg-green-100 px-3 py-2 text-sm font-medium text-green-800 dark:bg-green-950 dark:text-green-300">{note}</div>}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
            {s.courts.map((c) => (
              <CourtCard key={`${c.id}:${c.match ? c.match.startedAt : 'idle'}`} s={s} c={c} now={now} speaking={speakingId === c.id} onAnnounce={(text) => announce(c.id, text)} onWin={(side, gid) => { if (!c.match || !gameIsArmed(c.match.startedAt)) return; const ids = side === 'a' ? c.match?.a : c.match?.b; if (updateActive((x) => finishMatch(x, c.id, { winner: side, scoreA: null, scoreB: null, expect: gid }))) { buzz('win'); refocusCourt = c.id; showWon(`${join((ids ?? []).map((id) => nameOf(s, id)))} won on ${c.name}`) } }} onScore={() => setScoring(c.id)} onTags={() => setTagFor(c.id)} onSub={(id) => setSubFor({ court: c.id, id })} onRemix={() => remix((x) => remixCourt(x, c.id), c.name)} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            <span className="text-slate-500">{s.courts.length} {s.courts.length === 1 ? 'court' : 'courts'}</span>
            <button className="btn-soft !min-h-10" onClick={() => { updateActive((x) => addCourt(x)); flash('Court added. It fills from the queue straight away.') }} disabled={s.courts.length >= MAX_COURTS}>
              <Plus size={16} /> Add court
            </button>
            {showHints && <span className="text-xs text-slate-500 dark:text-slate-400">To remove one, tap its <Settings2 size={12} className="inline" /> icon.</span>}
          </div>
          <NextMatch speaking={speakingId === 'next'} onAnnounce={(text) => announce('next', text)} hints={showHints} s={s} eta={eta} upcoming={upcoming} freeCourts={freeCourts} waiting={waitingPlayers} need={need} onPick={setWaitFor} onSwap={swapNext} onRemix={() => remix(remixNext, 'Next match')} />
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Waiting line</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold dark:bg-slate-800">{waitingPlayers} waiting</span>
            </div>
            {waiting.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">Everyone is on court.</p>
            )}
            {waiting.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold text-slate-500">Games played · when you are up (tap a name to move)</div>
                <div className="flex flex-wrap gap-1.5">
                  {waiting.map((u) => (
                    <button key={u.key} onClick={() => setWaitFor(u.ids[0])} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">
                      {u.pri < 0 && <span title="Playing next">⏭ </span>}
                      {u.pri > 0 && <span title="Sent to back">⏬ </span>}
                      {u.ids.map((id) => nameOf(s, id)).join(' & ')} <span className="text-slate-400">· {s.players.filter((p) => u.ids.includes(p.id)).reduce((n, p) => Math.max(n, playedOf(p, counts)), 0)}</span>
                      {etaText(eta.get(u.ids[0])) && <span className="ml-1 text-xs font-normal text-green-700 dark:text-green-400">{etaText(eta.get(u.ids[0]))}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {resting.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 flex items-center gap-2 font-bold"><Moon size={16} /> On a break</h2>
              <div className="flex flex-wrap gap-2">
                {resting.map((p) => (
                  <button key={p.id} className="btn-soft !min-h-9 !px-3" onClick={() => updateActive((x) => setStatus(x, p.id, 'active'))}>
                    {p.name} <span className="text-green-700 dark:text-green-400">Back</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      {court?.match && <ScoreSheet s={s} court={court} onClose={() => setScoring(null)} />}
      {people && <PeopleSheet s={s} onClose={() => setPeople(false)} />}
      {adding && <AddPlayerSheet s={s} onClose={() => setAdding(false)} />}
      {voiceOpen && <VoiceSheet onClose={() => setVoiceOpen(false)} />}
      {won && (
        <div key={won.id} role="status" aria-live="polite" className="paddl-in fixed inset-x-3 top-[3.75rem] z-[55] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-accent/40 bg-slate-900/95 px-3 py-2.5 text-white shadow-[0_0_40px_-10px_rgba(182,255,59,0.6)] backdrop-blur-xl md:top-auto md:bottom-4">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"><Trophy size={15} /></span>
          <span className="min-w-0 flex-1 text-sm leading-snug font-bold [overflow-wrap:anywhere]">{won.text}</span>
          <button className="btn-toast !min-h-9 shrink-0 !px-3" onClick={() => { if (undoIfUnchanged(won.at)) buzz('undo'); setWon(null) }} aria-label="Undo this result"><Undo2 size={15} /> Undo</button>
        </div>
      )}
      {board && <Board s={s} onClose={() => setBoard(false)} />}
      {tagFor && <TagSheet s={s} courtId={tagFor} onClose={() => setTagFor(null)} onNote={flash} />}
      {waitFor && <WaitSheet s={s} id={waitFor} onClose={() => setWaitFor(null)} />}
      {subFor && <SubSheet s={s} courtId={subFor.court} outId={subFor.id} onClose={() => setSubFor(null)} />}
    </div>
  )
}

/** After a result is recorded the court is redrawn as a new card, which drops the focus a keyboard or screen-reader user had. */
let refocusCourt: string | null = null

function CourtCard({ s, c, now, speaking, onAnnounce, onScore, onSub, onRemix, onWin, onTags }: { s: Session; c: Court; now: number; speaking: boolean; onAnnounce: (text: string) => void; onScore: () => void; onSub: (id: string) => void; onRemix: () => void; onWin: (side: 'a' | 'b', gid: number | undefined) => void; onTags: () => void }) {
  const m = c.match
  const winners = isKing(s, c)
  const call = streakCall(s, c.id)
  const riv = m ? rivalryFor(s, m.a, m.b) : null
  const overTime = !!m && now - m.startedAt >= TIME_MARK_MIN * 60000
  // Time on court as a bar: lime, then amber from 10 minutes, then red at the time mark.
  const mins = m ? Math.max(0, now - m.startedAt) / 60000 : 0
  const pct = m ? Math.min(100, (mins / TIME_MARK_MIN) * 100) : 100
  const barColor = !m ? 'bg-slate-600' : mins >= TIME_MARK_MIN ? 'bg-red-600' : mins >= 10 ? 'bg-amber-400' : 'bg-accent'
  const card = useRef<HTMLElement>(null)
  useEffect(() => {
    if (refocusCourt !== c.id) return
    refocusCourt = null
    if (document.activeElement && document.activeElement !== document.body) return
    const el = card.current?.querySelector<HTMLElement>('button[aria-label$=" won"]') ?? card.current
    el?.focus({ preventScroll: true })
  }, [c.id])
  return (
    <section ref={card} tabIndex={-1} className="card paddl-in court-new overflow-hidden outline-none">
      <div className="relative flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-2.5 text-white dark:border-white/10 dark:bg-white/[0.04]">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-white/10" />
        <span aria-hidden title={m ? `${Math.floor(mins)} min on court` : undefined} className={`absolute top-0 left-0 h-1 transition-[width] duration-1000 ${barColor}`} style={{ width: `${pct}%` }} />
        <h2 className="font-bold">{c.name}</h2>
        <button onClick={onTags} className="ml-2 grid h-8 w-8 place-items-center rounded-full bg-white/15 hover:bg-white/25" aria-label={`${c.name} settings`} title="Court settings: badges and remove"><Settings2 size={15} /></button>
        {m && (
          <button
            onClick={() => onAnnounce(courtCall(c.name, m.a.map((id) => nameOf(s, id)), m.b.map((id) => nameOf(s, id))))}
            className={`ml-1.5 grid h-8 w-8 place-items-center rounded-full ${speaking ? 'speaking-pulse bg-accent text-accent-ink' : 'bg-white/15 hover:bg-white/25'}`}
            aria-label={speaking ? `Stop announcing ${c.name}` : `Call out ${c.name}`}
            aria-pressed={speaking}
            title={speaking ? 'Calling out the players. Tap to stop.' : 'Call out the players on this court'}
          >
            <Volume2 size={15} />
          </button>
        )}
        <span className="flex-1" />
        {m && (
          <span className="flex items-center gap-1 text-xs font-medium text-slate-300">
            {winners && m.streak > 0 && <span className="mr-1 flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5"><Crown size={12} /> {m.streak} in a row</span>}
            <Clock size={12} /> {elapsed(m.startedAt, now)}
          </span>
        )}
      </div>
      {!!c.tags?.length && (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-800/50">
          {c.tags.map((tag) => (
            <span key={tag} title={COURT_TAGS[tag].hint} className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm dark:bg-slate-700 dark:text-slate-100">{COURT_TAGS[tag].emoji} {COURT_TAGS[tag].label}</span>
          ))}
        </div>
      )}
      {m && overTime && <div className="bg-amber-100 px-3 py-1 text-center text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">⏱ Over {TIME_MARK_MIN} minutes on this court</div>}
      {call && <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"><Crown size={15} /> {call}</div>}
      {m ? (
        <div className="p-3">
          {/* The court: far half on top, the net, then the near half. Partners stand in the left and right service courts. */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-inner dark:border-white/10" role="group" aria-label={`${c.name} court`}>
            <Half s={s} ids={m.a} side="far" king={winners && m.streak > 0} onSub={onSub} />
            <div className="relative z-10 flex items-center gap-2 bg-slate-900 px-3 py-1.5 text-[10px] font-black tracking-[0.3em] text-slate-300 dark:bg-black/60" aria-hidden>
              <span className="h-px flex-1 bg-[repeating-linear-gradient(90deg,#8a97b1_0_3px,transparent_3px_7px)]" />
              <Vs />
              <span className="h-px flex-1 bg-[repeating-linear-gradient(90deg,#8a97b1_0_3px,transparent_3px_7px)]" />
            </div>
            <Half s={s} ids={m.b} side="near" onSub={onSub} />
          </div>
          <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
            <button className="btn-primary !min-h-12 min-w-0 !justify-start !px-4" onClick={() => onWin('a', m.gid)} aria-label={`${join(m.a.map((id) => nameOf(s, id)))} won`}>
              <Trophy size={18} className="shrink-0" /> <span className="truncate">{join(m.a.map((id) => nameOf(s, id)))} won</span>
            </button>
            <button className="btn-primary !min-h-12 min-w-0 !justify-start !px-4" onClick={() => onWin('b', m.gid)} aria-label={`${join(m.b.map((id) => nameOf(s, id)))} won`}>
              <Trophy size={18} className="shrink-0" /> <span className="truncate">{join(m.b.map((id) => nameOf(s, id)))} won</span>
            </button>
          </div>
          {riv && <p className="mt-3 rounded-lg bg-sky-100 px-3 py-1.5 text-center text-sm font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">{riv.text}</p>}
          <div className="mt-3 flex gap-2">
            <button className="btn-soft flex-1 !min-h-9" onClick={onScore} title="Enter the score, or mark no contest / cancel">Score…</button>
            <button className="btn-soft flex-1 !min-h-9" onClick={onRemix} title="Reshuffle this game: the four on court go back to the line and a different four are picked" aria-label={`Remix ${c.name}`}>
              <Shuffle size={16} /> Reshuffle
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {c.hold ? (
            <>
              <div className="mb-1 font-semibold text-slate-700 dark:text-slate-200">{join(c.hold.ids.map((id) => nameOf(s, id)))}</div>
              holding the court, waiting for challengers
            </>
          ) : (
            'Waiting for players'
          )}
        </div>
      )}
    </section>
  )
}

/** One team's half of the court: grass-green surface, white lines, partners in the left and right service courts. */
function Half({ s, ids, side, king, onSub }: { s: Session; ids: string[]; side: 'near' | 'far'; king?: boolean; onSub: (id: string) => void }) {
  return (
    <div className="relative bg-gradient-to-b from-emerald-600 to-emerald-700 text-white dark:from-emerald-700 dark:to-emerald-800">
      <HalfCourt side={side} className="pointer-events-none absolute inset-0 h-full w-full text-white/70" />
      <div className={`relative grid min-h-[5.5rem] ${ids.length > 1 ? 'grid-cols-[repeat(2,minmax(0,1fr))]' : 'grid-cols-[minmax(0,1fr)]'} ${side === 'far' ? 'items-start pt-3 pb-5' : 'items-end pt-5 pb-3'}`}>
        {ids.map((id) => (
          <button
            key={id}
            onClick={() => onSub(id)}
            title="Tap to swap this player"
            className={`mx-2 truncate rounded-xl px-2 py-2.5 text-center text-base font-black tracking-tight shadow-lg backdrop-blur-sm transition active:scale-95 ${
              king ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-100/80' : 'bg-slate-950/70 text-white ring-1 ring-white/25 hover:bg-slate-950/85'
            }`}
          >
            {nameOf(s, id)}
          </button>
        ))}
      </div>
    </div>
  )
}

function ScoreSheet({ s, court, onClose }: { s: Session; court: Court; onClose: () => void }) {
  const { ask, dialog } = useConfirm()
  const m = court.match!
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const nameA = join(m.a.map((id) => nameOf(s, id)))
  const nameB = join(m.b.map((id) => nameOf(s, id)))
  const haveScores = a !== '' && b !== ''
  const error = haveScores ? validateScore(Number(a), Number(b), s.config) : null

  function done(r: Result) {
    if (updateActive((x) => finishMatch(x, court.id, r))) buzz('win')
    onClose()
  }
  const submitScore = () => {
    if (!haveScores || error) return
    const sa = Number(a)
    const sb = Number(b)
    done({ winner: sa > sb ? 'a' : 'b', scoreA: sa, scoreB: sb })
  }

  return (
    <>
    <Sheet title={`${court.name}: score or result`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {(['a', 'b'] as const).map((side) => (
            <button key={side} onClick={() => done({ winner: side, scoreA: null, scoreB: null })} className="min-h-20 rounded-2xl border-2 border-slate-200 p-3 text-center text-base font-bold transition hover:border-green-600 hover:bg-green-50 dark:border-slate-700 dark:hover:bg-green-950/40">
              {side === 'a' ? nameA : nameB}
              <span className="mt-1 block text-xs font-medium text-slate-500">won</span>
            </button>
          ))}
        </div>

        <div className="relative py-1 text-center text-xs font-semibold text-slate-400">
          <span className="bg-white px-2 dark:bg-slate-900">tap a winner above, or enter the score for point difference</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label truncate">{nameA}</span>
            <input inputMode="numeric" pattern="[0-9]*" className="input text-center text-2xl font-bold" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
          <label className="block">
            <span className="label truncate">{nameB}</span>
            <input inputMode="numeric" pattern="[0-9]*" className="input text-center text-2xl font-bold" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 2))} onKeyDown={(e) => e.key === 'Enter' && submitScore()} />
          </label>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button className="btn-primary w-full !min-h-12" disabled={!haveScores || !!error} onClick={submitScore}>Save score</button>

        <div className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <button className="btn-soft flex-1" onClick={() => done({ winner: null, scoreA: null, scoreB: null })}><Ban size={16} /> No contest</button>
          <button
            className="btn-ghost flex-1 text-red-600"
            onClick={() => ask({
              title: 'Cancel this game?',
              body: 'It will not be recorded, and everyone goes back to the queue.',
              confirmLabel: 'Cancel game',
              danger: true,
              onConfirm: () => { updateActive((x) => cancelMatch(x, court.id)); onClose() },
            })}
          >
            Cancel game
          </button>
        </div>
      </div>
    </Sheet>
    {dialog}
    </>
  )
}

function SubSheet({ s, courtId, outId, onClose }: { s: Session; courtId: string; outId: string; onClose: () => void }) {
  const { ask, dialog } = useConfirm()
  const waiting = waitingUnits(s).flatMap((u) => u.ids)
  const counts = countMatches(s.matches)
  const teams = s.config.format === 'teams'
  return (
    <>
    <Sheet title={`${nameOf(s, outId)} is on court`} onClose={onClose}>
      <div className="space-y-3">
        {waiting.length > 0 && (
          <button className="btn-primary w-full" onClick={() => { updateActive((x) => pullOut(x, outId)); onClose() }}>
            <LogOut size={18} /> Pull out: next in line takes over
          </button>
        )}
        {!teams && (
          <>
            <p className="text-sm text-slate-500">Or pull in someone specific (they replace {nameOf(s, outId)}, who goes back in line):</p>
            {waiting.length === 0 && <p className="text-sm font-medium">Nobody is waiting.</p>}
            <div className="grid grid-cols-2 gap-2">
              {waiting.map((id) => (
                <button key={id} className="btn-soft" onClick={() => { updateActive((x) => substitute(x, courtId, outId, id)); onClose() }}>
                  {nameOf(s, id)} <span className="text-xs font-normal text-slate-500">· {playedOf(s.players.find((p) => p.id === id)!, counts)}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <button className="btn-soft flex-1" onClick={() => { updateActive((x) => setStatus(x, outId, 'resting')); onClose() }}><Moon size={16} /> Take a break</button>
          <button className="btn-ghost flex-1 text-red-600" onClick={() => ask({ title: `${nameOf(s, outId)} is leaving?`, body: 'They are taken off the court and out of the queue. Their results stay.', confirmLabel: 'They left', danger: true, onConfirm: () => { updateActive((x) => setStatus(x, outId, 'left')); onClose() } })}>Left</button>
        </div>
      </div>
    </Sheet>
    {dialog}
    </>
  )
}

/** Someone just turned up: add them straight into the line without ending the session. Stays open for the next one. */
function AddPlayerSheet({ s, onClose }: { s: Session; onClose: () => void }) {
  const [name, setName] = useState('')
  const [name2, setName2] = useState('')
  const [level, setLevelState] = useState(3.5)
  const [joined, setJoined] = useState<{ id: string; label: string }[]>([])
  const teams = s.config.format === 'teams'
  const dupe = !!name.trim() && (nameTaken(s, name) || (teams && (nameTaken(s, name2) || name.trim().toLowerCase() === name2.trim().toLowerCase())))
  const ready = teams ? !!name.trim() && !!name2.trim() : !!name.trim()
  const now = useNow()
  const eta = queueEta(s, now)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => { first.current?.focus() }, [])

  function add() {
    if (!ready || dupe) return
    const before = new Set(s.players.map((p) => p.id))
    const changed = updateActive((x) => (teams ? addTeam(x, { name, level }, { name: name2, level }) : addPlayer(x, name, level)))
    if (!changed) return
    setJoined((j) => [...j, { id: 'pending:' + (teams ? name.trim() + ' & ' + name2.trim() : name.trim()), label: teams ? name.trim() + ' & ' + name2.trim() : name.trim() }])
    void before
    setName('')
    setName2('')
    first.current?.focus()
  }

  // Where each person who just joined is in the line right now (it changes as games finish).
  function status(label: string): string {
    const ids = label.split(' & ').map((n) => s.players.find((p) => p.name.toLowerCase() === n.trim().toLowerCase())?.id).filter(Boolean) as string[]
    if (!ids.length) return ''
    if (s.courts.some((c) => c.match && ids.some((id) => [...c.match!.a, ...c.match!.b].includes(id)))) return 'playing now'
    const t = etaText(eta.get(ids[0]))
    return t ? t : 'in the waiting line'
  }

  return (
    <Sheet title={teams ? 'Add a late team' : 'Add a late player'} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {teams ? 'The new team joins the waiting line.' : 'They join the waiting line right away. Games on court are not interrupted.'}
          {s.config.lateJoinMedian ? ' They start at the average games played, so they are not ahead or behind.' : ''}
        </p>
        <div className="flex gap-2">
          <input ref={first} className="input" placeholder={teams ? 'Player 1' : 'Name'} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => isEnter(e) && add()} aria-label={teams ? 'Player 1 name' : 'Name of the new player'} />
          {teams && <input className="input" placeholder="Player 2" value={name2} maxLength={30} onChange={(e) => setName2(e.target.value)} onKeyDown={(e) => isEnter(e) && add()} aria-label="Player 2 name" />}
        </div>
        {s.config.mode === 'skill' && (
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            Skill level
            <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900" value={level} onChange={(e) => setLevelState(Number(e.target.value))}>
              {[2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5].map((l) => <option key={l} value={l}>{l.toFixed(1)}</option>)}
            </select>
          </label>
        )}
        {dupe && <p className="text-xs font-medium text-red-600">That name is already in this session. Add a last initial, like "Sam R".</p>}
        <button className="btn-primary w-full !min-h-12" onClick={add} disabled={!ready || dupe}><UserPlus size={18} /> {teams ? 'Add team' : 'Add to the line'}</button>
        {joined.length > 0 && (
          <ul className="space-y-1.5" aria-label="Just added">
            {joined.map((j, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm dark:bg-green-950/40">
                <span className="min-w-0 truncate font-bold">✓ {j.label}</span>
                <span className="shrink-0 text-xs font-semibold text-green-800 dark:text-green-300">{status(j.label)}</span>
              </li>
            ))}
          </ul>
        )}
        <button className="btn-soft w-full" onClick={onClose}>{joined.length ? 'Done' : 'Cancel'}</button>
      </div>
    </Sheet>
  )
}

function PeopleSheet({ s, onClose }: { s: Session; onClose: () => void }) {
  const [name, setName] = useState('')
  const [name2, setName2] = useState('')
  const teams = s.config.format === 'teams'
  const dupe = nameTaken(s, name) || (teams && (nameTaken(s, name2) || name.trim().toLowerCase() === name2.trim().toLowerCase()))
  const ready = teams ? name.trim() && name2.trim() : name.trim()
  const counts = countMatches(s.matches)
  const onCourt = new Set(s.courts.flatMap((c) => (c.match ? [...c.match.a, ...c.match.b] : [])))

  function add() {
    if (!ready || dupe) return
    updateActive((x) => (teams ? addTeam(x, { name }, { name: name2 }) : addPlayer(x, name)))
    setName('')
    setName2('')
  }

  return (
    <Sheet title="Players" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="label">{teams ? 'Add a late team' : 'Add a late player'}</div>
          <div className="flex gap-2">
            <input className="input" placeholder={teams ? 'Player 1' : 'Name'} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => isEnter(e) && add()} />
            {teams && <input className="input" placeholder="Player 2" value={name2} onChange={(e) => setName2(e.target.value)} onKeyDown={(e) => isEnter(e) && add()} />}
            <button className="btn-primary !px-4" onClick={add} disabled={!ready || dupe} aria-label="Add"><UserPlus size={20} /></button>
          </div>
          {dupe && <p className="mt-1 text-xs font-medium text-red-600">That name is already in this session.</p>}
          {s.config.lateJoinMedian && <p className="mt-1 text-xs text-slate-500">New arrivals start at the average games played, so they join the line fairly.</p>}
        </div>
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {s.players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <button
                  className="block min-h-9 w-full truncate text-left font-semibold leading-9"
                  title="Tap to rename"
                  onClick={() => {
                    const n = prompt('Rename player', p.name)
                    if (!n || n.trim() === p.name) return
                    if (nameTaken(s, n, p.id)) { alert(`${n.trim()} is already in this session. Pick a different name.`); return }
                    updateActive((x) => renamePlayer(x, p.id, n.trim().slice(0, 30)))
                  }}
                >
                  {p.name}
                </button>
                <div className="text-xs text-slate-500">
                  {plural(playedOf(p, counts), 'game')}{onCourt.has(p.id) ? ' · on court' : ''}{p.status !== 'active' ? ` · ${p.status === 'resting' ? 'on a break' : 'left'}` : ''}
                </div>
              </div>
              {s.config.mode === 'skill' && p.status === 'active' && (
                <select aria-label={`${p.name} level`} className="rounded-lg border border-slate-300 bg-white px-1 py-1 text-xs dark:border-slate-600 dark:bg-slate-900" value={p.level} onChange={(e) => updateActive((x) => setLevel(x, p.id, Number(e.target.value)))}>
                  {[2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5].map((l) => <option key={l} value={l}>{l.toFixed(1)}</option>)}
                </select>
              )}
              {p.status === 'active' ? (
                <button className="btn-soft !min-h-9 !px-3" onClick={() => updateActive((x) => setStatus(x, p.id, 'resting'))}><Moon size={14} /> Break</button>
              ) : (
                <button className="btn-soft !min-h-9 !px-3" onClick={() => updateActive((x) => setStatus(x, p.id, 'active'))}><Plus size={14} /> Back in</button>
              )}
            </li>
          ))}
        </ul>
        {s.players.length === 0 && <Empty title="No players yet" />}
      </div>
    </Sheet>
  )
}

function NextMatch({ s, eta, upcoming, freeCourts, waiting, need, onPick, onSwap, onRemix, speaking, onAnnounce, hints }: {
  speaking: boolean
  onAnnounce: (text: string) => void
  hints: boolean
  s: Session
  eta: ReturnType<typeof queueEta>
  upcoming: ReturnType<typeof previewQueue>
  freeCourts: number
  waiting: number
  need: number
  onPick: (id: string) => void
  onSwap: (id: string) => void
  onRemix: () => void
}) {
  const next = upcoming[0]
  const winners = s.config.mode === 'winners'
  const unitWord = s.config.format === 'teams' ? 'team' : 'player'
  return (
    <section id="next-match" key={next ? [...next.a, ...(next.b ?? [])].join() : 'none'} className="scroll-mt-28 card paddl-in border-2 border-green-600/40 bg-green-50/60 p-4 dark:bg-green-950/20">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-extrabold tracking-wide text-green-700 uppercase dark:text-green-400">{s.config.mode === 'mystery' ? 'Next match (a surprise: teams are re-mixed when it starts)' : 'Next match'}</h2>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline">{freeCourts ? 'starting on a free court' : 'when a court frees up'}</span>
          {next && (
            <button className="btn-soft !min-h-9 !px-3" onClick={onRemix} title="Redraw the next match: different partners and opponents from the people already waiting" aria-label="Redraw next match">
              <Shuffle size={16} /> Redraw next
            </button>
          )}
        </div>
      </div>
      {next ? (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <TeamBox s={s} ids={next.a} onPick={onPick} onSwap={onSwap} canSwap={waiting > need} />
          <div className="flex justify-center">{next.b ? <Vs /> : <span className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400">CHALLENGE</span>}</div>
          {next.b ? (
            <TeamBox s={s} ids={next.b} onPick={onPick} onSwap={onSwap} canSwap={waiting > need} />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-sm text-slate-500 dark:border-slate-600">the winners holding the court</div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {waiting === 0
            ? 'Everyone is on court right now.'
            : winners
              ? 'Waiting for a challenger.'
              : `Need ${plural(Math.max(1, need - waiting), unitWord)} more to make the next match.`}
        </p>
      )}
      {next && (
        <button
          className={`btn-soft mt-3 w-full !min-h-12 ${speaking ? 'speaking-pulse !border-accent !bg-accent/15 text-brand' : ''}`}
          onClick={() => onAnnounce(upNextCall(next.a.map((id) => nameOf(s, id)), next.b ? next.b.map((id) => nameOf(s, id)) : null))}
          aria-label={speaking ? 'Stop announcing the next match' : 'Call out the next match'}
          aria-pressed={speaking}
          title="Call out the players who are up next"
        >
          <Volume2 size={18} /> {speaking ? 'Calling out… tap to stop' : 'Call out the players up next'}
        </button>
      )}
      {next?.b && (() => {
        const riv = rivalryFor(s, next.a, next.b)
        const t = etaIn(eta.get(next.a[0]))
        return (
          <>
            {t && !freeCourts && <p className="mt-2 text-sm font-semibold text-green-700 dark:text-green-400">⏱ Up in {t}</p>}
            {riv && <p className="mt-2 rounded-lg bg-sky-100 px-3 py-1.5 text-sm font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">{riv.text}</p>}
          </>
        )
      })()}
      {hints && next && waiting <= need && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Nobody extra is waiting, so there is no one to swap in yet. Tap a name to make someone play next or pull a player in.</p>
      )}
      {next && upcoming[1] && (
        <p className="mt-2 truncate text-xs text-slate-500">
          Then: {join(upcoming[1].a.map((id) => nameOf(s, id)))}
          {upcoming[1].b ? ` vs ${join(upcoming[1].b.map((id) => nameOf(s, id)))}` : ''}
        </p>
      )}
    </section>
  )
}

function TeamBox({ s, ids, onPick, onSwap, canSwap }: { s: Session; ids: string[]; onPick: (id: string) => void; onSwap: (id: string) => void; canSwap: boolean }) {
  return (
    <div className={`grid gap-1.5 ${ids.length > 1 ? 'grid-cols-[repeat(2,minmax(0,1fr))]' : 'grid-cols-[minmax(0,1fr)]'}`}>
      {ids.map((id) => (
        <div key={id} className="flex min-h-11 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-slate-800">
          <button onClick={() => onPick(id)} className="min-w-0 flex-1 truncate px-2 py-2 text-center font-bold" title="More options">
            {nameOf(s, id)}
          </button>
          {canSwap && (
            <button
              onClick={() => onSwap(id)}
              className="grid w-10 shrink-0 place-items-center border-l border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-green-700 dark:border-slate-700 dark:hover:bg-slate-700"
              aria-label={`Swap ${nameOf(s, id)} out`}
              title="Swap out: next in line steps up"
            >
              <Repeat2 size={17} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function WaitSheet({ s, id, onClose }: { s: Session; id: string; onClose: () => void }) {
  const { ask, dialog } = useConfirm()
  const p = s.players.find((x) => x.id === id)
  const teams = s.config.format === 'teams'
  const live = s.courts.filter((c) => c.match)
  const done = (fn: (x: Session) => Session) => {
    updateActive(fn)
    onClose()
  }
  if (!p) return null
  const title = teams ? (s.teams.find((t) => t.playerIds.includes(id))?.name ?? p.name) : p.name
  return (
    <>
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={() => done((x) => playNext(x, id))}><ArrowUpToLine size={18} /> Play next</button>
          <button className="btn-soft" onClick={() => done((x) => sendBack(x, id))}><ArrowDownToLine size={18} /> Send to back</button>
        </div>
        {p.prio && <button className="btn-ghost w-full" onClick={() => done((x) => clearPriority(x, id))}>Reset to normal position</button>}

        <div>
          <div className="label">Pull into a game now</div>
          {live.length === 0 && <p className="text-sm text-slate-500">No games are running.</p>}
          <div className="space-y-3">
            {live.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                <div className="mb-1.5 text-xs font-semibold text-slate-500">{c.name}: replace who?</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[...c.match!.a, ...c.match!.b].map((outId) => (
                    <button key={outId} className="btn-soft !min-h-10 truncate" onClick={() => done((x) => substitute(x, c.id, outId, id))}>
                      <LogIn size={14} /> {nameOf(s, outId)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {teams && <p className="mt-1 text-xs text-slate-500">The whole team comes in and replaces the team on that side.</p>}
        </div>

        <div className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <button className="btn-soft flex-1" onClick={() => done((x) => setStatus(x, id, 'resting'))}><Moon size={16} /> Take a break</button>
          <button className="btn-ghost flex-1 text-red-600" onClick={() => ask({ title: `${p.name} is leaving?`, body: 'They are taken out of the queue. Their results stay.', confirmLabel: 'They left', danger: true, onConfirm: () => done((x) => setStatus(x, id, 'left')) })}>Left</button>
        </div>
      </div>
    </Sheet>
    {dialog}
    </>
  )
}

function TagSheet({ s, courtId, onClose, onNote }: { s: Session; courtId: string; onClose: () => void; onNote: (m: string) => void }) {
  const c = s.courts.find((x) => x.id === courtId)
  const [confirm, setConfirm] = useState(false)
  if (!c) return null
  const plan = planCourtRemoval(s, c.id)
  return (
    <Sheet title={`${c.name} settings`} onClose={onClose}>
      <div className="space-y-2">
        <p className="text-sm text-slate-500">Badges show on the court card and the board so everyone knows what to expect before stepping on.</p>
        {(Object.keys(COURT_TAGS) as CourtTag[]).map((tag) => {
          const on = !!c.tags?.includes(tag)
          return (
            <button
              key={tag}
              role="switch"
              aria-checked={on}
              onClick={() => updateActive((x) => toggleCourtTag(x, c.id, tag))}
              className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition ${on ? 'border-green-600 bg-green-50 dark:bg-green-950/40' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <span className="text-2xl">{COURT_TAGS[tag].emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{COURT_TAGS[tag].label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{COURT_TAGS[tag].hint}</span>
              </span>
              <span className={`text-sm font-bold ${on ? 'text-green-700 dark:text-green-400' : 'text-slate-400'}`}>{on ? 'On' : 'Off'}</span>
            </button>
          )
        })}

        <div className="border-t border-slate-200 pt-3 dark:border-white/10">
          <div className="label">Remove this court</div>
          {!plan ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">You need at least one court, so the last one cannot be removed.</p>
          ) : !confirm ? (
            <button className="btn-ghost w-full justify-start text-red-600" onClick={() => setConfirm(true)}><Trash2 size={16} /> Remove {c.name}</button>
          ) : (
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm font-semibold text-red-900 dark:text-red-200">Remove {c.name}?</p>
              <p className="mt-1 text-xs text-red-800 dark:text-red-300">
                {plan.kind === 'idle' && 'Nothing is playing on it, so nobody is affected.'}
                {plan.kind === 'moved' && `A game is in progress. It will carry on, with the same players and clock, on ${plan.to}.`}
                {plan.kind === 'queued' && `A game is in progress and no other court is free. It will not be recorded, and its ${plan.players} players go to the front of the line so they do not lose their turn.`}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="btn-soft" onClick={() => setConfirm(false)}>Keep it</button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    updateActive((x) => removeCourt(x, c.id))
                    onNote(`${c.name} removed.${plan.kind === 'moved' ? ` The game moved to ${plan.to}.` : plan.kind === 'queued' ? ' Its players are first in line.' : ''} Undo is at the top.`)
                    onClose()
                  }}
                >
                  Yes, remove
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
