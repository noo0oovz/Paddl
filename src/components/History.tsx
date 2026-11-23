import { useState } from 'react'
import { Ban, ChevronRight, Trash2, Trophy } from 'lucide-react'
import type { Match, Session } from '../engine/types'
import { deleteMatch, editMatch, type Result } from '../engine/session'
import { nameOf } from '../engine/stats'
import { validateScore } from '../engine/validate'
import { updateActive } from '../store'
import { fmtTime, join } from '../lib/util'
import { Empty, Sheet } from './ui'

export default function History({ s, readOnly }: { s: Session; readOnly?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const list = [...s.matches].sort((x, y) => y.seq - x.seq)
  const open = s.matches.find((m) => m.id === openId) ?? null

  function flash(msg: string) {
    setNote(msg)
    setTimeout(() => setNote(null), 4000)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-6">
      <h1 className="mb-1 text-xl font-extrabold">Match history</h1>
      {!readOnly && list.length > 0 && <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Tap a game to fix the winner or score, or to delete it.</p>}
      {note && <div role="status" className="mb-3 rounded-xl bg-green-100 px-3 py-2 text-sm font-medium text-green-800 dark:bg-green-950 dark:text-green-300">{note}</div>}
      {list.length === 0 ? (
        <Empty title="No games yet" hint="Finished games will show up here." />
      ) : (
        <ul className="space-y-2">
          {list.map((m) => {
            const body = (
              <>
                <div className="w-9 shrink-0 text-center text-xs font-bold text-slate-400">#{m.seq}</div>
                <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                  <Line s={s} ids={m.a} score={m.scoreA} won={m.winner === 'a'} />
                  <Line s={s} ids={m.b} score={m.scoreB} won={m.winner === 'b'} />
                  <div className="text-xs text-slate-400">{m.court} · {fmtTime(m.at)}{m.winner === null ? ' · no contest' : ''}</div>
                </div>
                {!readOnly && <ChevronRight size={18} className="shrink-0 text-slate-400" />}
              </>
            )
            return (
              <li key={m.id}>
                {readOnly ? (
                  <div className="card flex items-center gap-3 p-3">{body}</div>
                ) : (
                  <button className="card flex w-full items-center gap-3 p-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => setOpenId(m.id)} aria-label={`Edit game ${m.seq}`}>
                    {body}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {open && <EditSheet key={open.id} s={s} m={open} onClose={() => setOpenId(null)} onDone={flash} />}
    </div>
  )
}

function Line({ s, ids, score, won }: { s: Session; ids: string[]; score: number | null; won: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${won ? 'font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
      <span className="truncate">{won && '🏆 '}{join(ids.map((id) => nameOf(s, id)))}</span>
      {score !== null && <span className="tabular-nums">{score}</span>}
    </div>
  )
}

function EditSheet({ s, m, onClose, onDone }: { s: Session; m: Match; onClose: () => void; onDone: (msg: string) => void }) {
  const [a, setA] = useState(m.scoreA?.toString() ?? '')
  const [b, setB] = useState(m.scoreB?.toString() ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const nameA = join(m.a.map((id) => nameOf(s, id)))
  const nameB = join(m.b.map((id) => nameOf(s, id)))
  const have = a !== '' && b !== ''
  const error = have ? validateScore(Number(a), Number(b), s.config) : null

  function save(r: Result, msg: string) {
    updateActive((x) => editMatch(x, m.id, r))
    onDone(`${msg} Standings updated. Undo is at the top if that was a mistake.`)
    onClose()
  }

  function remove() {
    updateActive((x) => deleteMatch(x, m.id))
    onDone(`Game #${m.seq} deleted. Those players are back in the queue where they were. Undo is at the top to bring it back.`)
    onClose()
  }

  return (
    <Sheet title={`Game #${m.seq}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="label">Who won?</div>
          <div className="grid grid-cols-2 gap-2">
            {(['a', 'b'] as const).map((side) => {
              const on = m.winner === side
              return (
                <button
                  key={side}
                  aria-pressed={on}
                  onClick={() => (on ? undefined : save({ winner: side, scoreA: null, scoreB: null }, `${side === 'a' ? nameA : nameB} marked as the winner.`))}
                  className={`min-h-16 rounded-2xl border-2 p-2 text-center text-sm font-bold transition ${on ? 'border-green-600 bg-green-50 text-green-900 dark:bg-green-950/40 dark:text-green-200' : 'border-slate-200 hover:border-green-600 dark:border-slate-700'}`}
                >
                  {on && <Trophy size={14} className="mx-auto mb-0.5" />}
                  {side === 'a' ? nameA : nameB}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Changing the winner clears the score. Enter the score below to keep one.</p>
        </div>

        <div>
          <div className="label">Or fix the score</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label truncate">{nameA}</span><input inputMode="numeric" pattern="[0-9]*" className="input text-center text-2xl font-bold" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
            <label className="block"><span className="label truncate">{nameB}</span><input inputMode="numeric" pattern="[0-9]*" className="input text-center text-2xl font-bold" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
          </div>
          {error && <p className="mt-1.5 text-sm font-medium text-red-600">{error}</p>}
          <button className="btn-primary mt-2 w-full" disabled={!have || !!error} onClick={() => save({ winner: Number(a) > Number(b) ? 'a' : 'b', scoreA: Number(a), scoreB: Number(b) }, 'Score saved.')}>Save score</button>
        </div>

        <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          {m.winner !== null && (
            <button className="btn-soft w-full" onClick={() => save({ winner: null, scoreA: null, scoreB: null }, 'Marked as no contest.')}>
              <Ban size={16} /> Mark as no contest (played, but no result)
            </button>
          )}
          {!confirmDelete ? (
            <button className="btn-ghost w-full text-red-600" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} /> Delete this game
            </button>
          ) : (
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm font-semibold text-red-900 dark:text-red-200">Delete game #{m.seq}?</p>
              <p className="mt-1 text-xs text-red-800 dark:text-red-300">
                Use this when the game never happened or was recorded by mistake. It is removed from standings, history and the saved images, and the {m.a.length + m.b.length} players are put back in the queue where they were.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="btn-soft" onClick={() => setConfirmDelete(false)}>Keep it</button>
                <button className="btn-danger" onClick={remove}>Yes, delete</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
