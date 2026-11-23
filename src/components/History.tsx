import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Match, Session } from '../engine/types'
import { deleteMatch, editMatch } from '../engine/session'
import { nameOf } from '../engine/stats'
import { validateScore } from '../engine/validate'
import { updateActive } from '../store'
import { fmtTime, join } from '../lib/util'
import { Empty, Sheet } from './ui'

export default function History({ s, readOnly }: { s: Session; readOnly?: boolean }) {
  const [editing, setEditing] = useState<Match | null>(null)
  const list = [...s.matches].sort((x, y) => y.seq - x.seq)
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-6">
      <h1 className="mb-3 text-xl font-extrabold">Match history</h1>
      {list.length === 0 ? (
        <Empty title="No games yet" hint="Finished games will show up here." />
      ) : (
        <ul className="space-y-2">
          {list.map((m) => (
            <li key={m.id} className="card flex items-center gap-3 p-3">
              <div className="w-9 shrink-0 text-center text-xs font-bold text-slate-400">#{m.seq}</div>
              <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                <Line s={s} ids={m.a} score={m.scoreA} won={m.winner === 'a'} />
                <Line s={s} ids={m.b} score={m.scoreB} won={m.winner === 'b'} />
                <div className="text-xs text-slate-400">{m.court} · {fmtTime(m.at)}{m.winner === null ? ' · no contest' : ''}</div>
              </div>
              {!readOnly && (
                <div className="flex shrink-0 gap-1">
                  <button className="btn-ghost !min-h-10 !px-2.5" onClick={() => setEditing(m)} aria-label="Edit game"><Pencil size={16} /></button>
                  <button className="btn-ghost !min-h-10 !px-2.5 text-red-600" onClick={() => confirm('Delete this game? Standings will update.') && updateActive((x) => deleteMatch(x, m.id))} aria-label="Delete game"><Trash2 size={16} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <EditSheet s={s} m={editing} onClose={() => setEditing(null)} />}
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

function EditSheet({ s, m, onClose }: { s: Session; m: Match; onClose: () => void }) {
  const [a, setA] = useState(m.scoreA?.toString() ?? '')
  const [b, setB] = useState(m.scoreB?.toString() ?? '')
  const nameA = join(m.a.map((id) => nameOf(s, id)))
  const nameB = join(m.b.map((id) => nameOf(s, id)))
  const have = a !== '' && b !== ''
  const error = have ? validateScore(Number(a), Number(b), s.config) : null
  const save = (r: Parameters<typeof editMatch>[2]) => { updateActive((x) => editMatch(x, m.id, r)); onClose() }
  return (
    <Sheet title={`Edit game #${m.seq}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label truncate">{nameA}</span><input inputMode="numeric" className="input text-center text-2xl font-bold" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
          <label className="block"><span className="label truncate">{nameB}</span><input inputMode="numeric" className="input text-center text-2xl font-bold" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={!have || !!error} onClick={() => save({ winner: Number(a) > Number(b) ? 'a' : 'b', scoreA: Number(a), scoreB: Number(b) })}>Save score</button>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <button className="btn-soft" onClick={() => save({ winner: 'a', scoreA: null, scoreB: null })}>{nameA} won (no score)</button>
          <button className="btn-soft" onClick={() => save({ winner: 'b', scoreA: null, scoreB: null })}>{nameB} won (no score)</button>
        </div>
        <button className="btn-ghost w-full" onClick={() => save({ winner: null, scoreA: null, scoreB: null })}>Mark as no contest</button>
      </div>
    </Sheet>
  )
}
