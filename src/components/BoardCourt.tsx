import { Crown } from 'lucide-react'
import { PaddleBall, Vs } from './art'
import { useFitText } from '../lib/fitText'

/**
 * A small pickleball court seen from above, for the Board. The top half is one team and the bottom half the other;
 * each half is ONE big tap target that records that team's win. The centre line splits a half into a left and a right
 * service box, one name in each (doubles), or one name across the half (singles). The net runs through the middle
 * with the VS ball on it, between the two kitchens.
 *
 * Names are drawn as large as they can be while still fitting their box: a long name shrinks, a short one is capped,
 * all names on a court share one size so they look even, and it re-fits when the court is resized (turning the tablet,
 * more courts on screen) or the names change.
 */
export default function BoardCourt({
  a, b, king, locked, label, onWinA, onWinB,
}: {
  a: { names: string[]; label: string }
  b: { names: string[]; label: string }
  king?: boolean
  locked?: boolean
  label: string
  onWinA: () => void
  onWinB: () => void
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
        <Half side="top" team={a} fontSize={size} doubles={doubles} king={king} locked={locked} onWin={onWinA} />
        {/* the kitchens and the net */}
        <div className="relative grid h-[4.25rem] grid-cols-2 border-y-2 border-slate-300/70 bg-[repeating-linear-gradient(135deg,rgba(148,163,184,0.10)_0_2px,transparent_2px_7px)] sm:h-[4.75rem]" aria-hidden>
          {/* the net is the dashed line across the middle; the KITCHEN labels sit BELOW it, never on it */}
          <span className="self-end pb-1.5 text-center text-[10px] font-bold tracking-[0.3em] text-slate-400">KITCHEN</span>
          <span className="self-end pb-1.5 text-center text-[10px] font-bold tracking-[0.3em] text-slate-400">KITCHEN</span>
          <span className="absolute inset-x-0 top-[38%] h-0 border-t-[3px] border-dashed border-white/90" />
          <span className="absolute top-[38%] -left-0.5 h-3 w-3 -translate-y-1/2 rounded-full bg-white" />
          <span className="absolute top-[38%] -right-0.5 h-3 w-3 -translate-y-1/2 rounded-full bg-white" />
          <span className="absolute top-[38%] left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"><Vs big /></span>
        </div>
        <Half side="bottom" team={b} fontSize={size} doubles={doubles} locked={locked} onWin={onWinB} />
      </div>
    </div>
  )
}

function Half({
  side, team, fontSize, doubles, king, locked, onWin,
}: {
  side: 'top' | 'bottom'
  team: { names: string[]; label: string }
  fontSize: number
  doubles: boolean
  king?: boolean
  locked?: boolean
  onWin: () => void
}) {
  return (
    <button
      type="button"
      onClick={onWin}
      aria-label={`${team.label} won`}
      aria-disabled={locked || undefined}
      className={`group relative block w-full text-center transition active:brightness-125 ${locked ? 'cursor-not-allowed' : 'hover:bg-accent/10 focus-visible:bg-accent/10'} ${king ? 'bg-amber-400/10' : ''}`}
    >
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
    </button>
  )
}
