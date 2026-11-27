import { useEffect, useRef, useState } from 'react'
import { Crown } from 'lucide-react'
import { PaddleBall, Vs } from './art'
import { useFitText } from '../lib/fitText'
import { useHold } from '../lib/useHold'
import { winHoldMs } from '../lib/util'

/**
 * A small pickleball court seen from above, for the Board. The top half is one team and the bottom half the other;
 * each half is ONE big target that records that team's win when it is PRESSED AND HELD (a quick touch only shows a hint). The centre line splits a half into a left and a right
 * service box, one name in each (doubles), or one name across the half (singles). The net runs through the middle
 * with the VS ball on it, between the two kitchens.
 *
 * Names are drawn as large as they can be while still fitting their box: a long name shrinks, a short one is capped,
 * all names on a court share one size so they look even, and it re-fits when the court is resized (turning the tablet,
 * more courts on screen) or the names change.
 */
export default function BoardCourt({
  a, b, king, locked, label, onWinA, onWinB, onLockedPress,
}: {
  a: { names: string[]; label: string }
  b: { names: string[]; label: string }
  king?: boolean
  locked?: boolean
  label: string
  onWinA: () => void
  onWinB: () => void
  /** A press while the Board is locked: the Board explains why nothing happens. */
  onLockedPress?: () => void
}) {
  const doubles = a.names.length > 1 || b.names.length > 1
  const all = [...a.names, ...b.names]
  // each name sits in one service box (half the court wide) in doubles, or the whole half in singles
  const { ref, size } = useFitText(all, { min: 13, max: 60, maxHeight: 62 })

  return (
    <div ref={ref} role="group" aria-label={label} className="board-court relative rounded-[1.4rem] p-3 sm:p-4">
      {/* lime corner brackets, like the reference */}
      <span aria-hidden className="absolute top-1 left-1 h-6 w-9 rounded-tl-2xl border-t-[3px] border-l-[3px] border-accent/90" />
      <span aria-hidden className="absolute top-1 right-1 h-6 w-9 rounded-tr-2xl border-t-[3px] border-r-[3px] border-accent/90" />
      <span aria-hidden className="absolute bottom-1 left-1 h-6 w-9 rounded-bl-2xl border-b-[3px] border-l-[3px] border-accent/90" />
      <span aria-hidden className="absolute right-1 bottom-1 h-6 w-9 rounded-br-2xl border-b-[3px] border-r-[3px] border-accent/90" />

      <div className="relative overflow-hidden rounded-xl border-2 border-slate-300/70 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 shadow-inner">
        <Half side="top" team={a} fontSize={size} doubles={doubles} king={king} locked={locked} onWin={onWinA} onLockedPress={onLockedPress} />
        {/* the kitchens and the net */}
        <div className="board-net relative grid h-[4.25rem] grid-cols-2 border-y-2 border-slate-300/70 bg-[repeating-linear-gradient(135deg,rgba(148,163,184,0.10)_0_2px,transparent_2px_7px)] sm:h-[4.75rem]" aria-hidden>
          {/* the net is the dashed line through the exact middle of the strip, with the VS ball on it. The KITCHEN labels sit either
              side of the ball, level with it (they used to hang below the line, which pulled the ball up and made it look off-centre). */}
          <span className="board-kitchen self-center justify-self-center pr-8 text-xs font-bold tracking-[0.3em] text-slate-400">KITCHEN</span>
          <span className="board-kitchen self-center justify-self-center pl-8 text-xs font-bold tracking-[0.3em] text-slate-400">KITCHEN</span>
          <span className="absolute inset-x-0 top-1/2 h-0 -translate-y-1/2 border-t-[3px] border-dashed border-white/90" />
          <span className="absolute top-1/2 -left-0.5 h-3 w-3 -translate-y-1/2 rounded-full bg-white" />
          <span className="absolute top-1/2 -right-0.5 h-3 w-3 -translate-y-1/2 rounded-full bg-white" />
          <span className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"><Vs big /></span>
        </div>
        <Half side="bottom" team={b} fontSize={size} doubles={doubles} locked={locked} onWin={onWinB} onLockedPress={onLockedPress} />
      </div>
    </div>
  )
}

/** A touch that wanders further than this is a scroll or a drag, not a press. */
const MOVE_LIMIT = 10

function Half({
  side, team, fontSize, doubles, king, locked, onWin, onLockedPress,
}: {
  side: 'top' | 'bottom'
  team: { names: string[]; label: string }
  fontSize: number
  doubles: boolean
  king?: boolean
  locked?: boolean
  onWin: () => void
  onLockedPress?: () => void
}) {
  const [hint, setHint] = useState(false)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const down = useRef<{ x: number; y: number } | null>(null)
  const { progress, start, stop } = useHold(winHoldMs(), onWin)
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current) }, [])

  function showHint() {
    setHint(true)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHint(false), 1600)
  }
  /** Finger or key lifted before the hold finished: nothing is recorded, and a person who only tapped is told what to do. */
  function release(showTheHint: boolean) {
    down.current = null
    if (stop() && showTheHint) showHint()
  }
  /** The hold was abandoned for another reason (the finger wandered off, the touch was taken over by a scroll): no hint. */
  const cancel = () => release(false)

  return (
    <button
      type="button"
      aria-label={`${team.label} won`}
      aria-description="Press and hold to record the win"
      aria-disabled={locked || undefined}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        if (locked) { onLockedPress?.(); return }
        down.current = { x: e.clientX, y: e.clientY }
        start()
      }}
      onPointerMove={(e) => {
        const d = down.current
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > MOVE_LIMIT) cancel()
      }}
      onPointerUp={() => release(true)}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault()
          if (locked) { onLockedPress?.(); return }
          start()
        }
      }}
      onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') release(true) }}
      onClick={(e) => e.preventDefault()}
      style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      className={`group relative block w-full text-center transition ${locked ? 'cursor-not-allowed' : 'hover:bg-accent/10 focus-visible:bg-accent/10'} ${king ? 'bg-amber-400/10' : ''}`}
    >
      {/* the hold filling up: lime rising from the edge nearest the net, so it reads as "charging" and is seen from across the court */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 ${side === 'top' ? 'bottom-0' : 'top-0'} bg-accent/35`}
        style={{ height: `${progress * 100}%`, boxShadow: progress > 0 ? 'inset 0 0 0 3px rgba(182,255,59,0.85)' : undefined, opacity: progress > 0 ? 1 : 0 }}
      />
      {/* the paddle in the corner of the half, as on the reference */}
      <span aria-hidden className={`pointer-events-none absolute ${side === 'top' ? 'top-1 left-1' : 'right-1 bottom-1'} opacity-70`}><PaddleBall size={16} glow={false} /></span>
      {king && <Crown aria-hidden size={18} className={`pointer-events-none absolute ${side === 'top' ? 'top-1.5 right-2' : 'right-2 bottom-1.5'} text-amber-300`} />}
      {/* the centre line between the two service boxes */}
      {doubles && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-0 border-l-2 border-slate-300/70" />}
      <span className={`grid ${doubles ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {team.names.map((n, i) => (
          <span key={i} data-fit-box className="flex min-h-[4.5rem] items-center justify-center px-3.5 py-4 sm:min-h-[5.5rem]">
            <span
              data-fit-text
              className={`block w-full overflow-hidden font-black tracking-tight text-ellipsis whitespace-nowrap ${king ? 'text-amber-200' : 'text-white'}`}
              style={{ fontSize, lineHeight: 1.1 }}
              title={n}
            >
              {n}
            </span>
          </span>
        ))}
      </span>
      {hint && (
        <span role="status" className="pointer-events-none absolute inset-x-3 top-1/2 z-10 -translate-y-1/2 rounded-xl bg-slate-950/90 px-3 py-2 text-base font-extrabold text-accent shadow-lg ring-1 ring-accent/60 sm:text-lg">
          Hold to record the win
        </span>
      )}
    </button>
  )
}
