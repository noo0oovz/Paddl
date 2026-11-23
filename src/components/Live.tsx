import { useState } from 'react'
import { Ban, Clock, Crown, Moon, Plus, Undo2, UserPlus, Users } from 'lucide-react'
import type { Court, Session } from '../engine/types'
import { previewQueue, waitingUnits, unitsNeeded } from '../engine/queue'
import { countMatches, gamesOf, nameOf } from '../engine/stats'
import {
  addPlayer, addTeam, cancelMatch, finishMatch, renamePlayer, setCourts, setLevel, setStatus, substitute, nameTaken, type Result,
} from '../engine/session'
import { validateScore } from '../engine/validate'
import { undo, updateActive, useData } from '../store'
import { elapsed, join, useNow } from '../lib/util'
import { Empty, Sheet } from './ui'

export default function Live({ s }: { s: Session }) {
  const { undo: undoDepth } = useData()
  const now = useNow()
  const [scoring, setScoring] = useState<string | null>(null)
  const [people, setPeople] = useState(false)
  const [subFor, setSubFor] = useState<{ court: string; id: string } | null>(null)

  const counts = countMatches(s.matches)
  const waiting = waitingUnits(s)
  const waitingPlayers = waiting.reduce((n, u) => n + u.ids.length, 0)
  const need = unitsNeeded(s.config.format)
  const upcoming = previewQueue(s, 4)
  const resting = s.players.filter((p) => p.status === 'resting')
  const winners = s.config.mode === 'winners'
  const freeCourts = s.courts.filter((c) => !c.match).length

  const court = s.courts.find((c) => c.id === scoring)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {s.matches.length} {s.matches.length === 1 ? 'game' : 'games'} played · {s.players.filter((p) => p.status === 'active').length} playing
        </div>
        <div className="flex gap-2">
          <button className="btn-soft !min-h-10" onClick={undo} disabled={!undoDepth} aria-label="Undo last action"><Undo2 size={18} /> Undo</button>
          <button className="btn-primary !min-h-10" onClick={() => setPeople(true)}><Users size={18} /> Players</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {s.courts.map((c) => (
              <CourtCard key={c.id} s={s} c={c} now={now} onScore={() => setScoring(c.id)} onSub={(id) => setSubFor({ court: c.id, id })} />
            ))}
          </div>
          <div className="flex items-center justify-center gap-3 text-sm">
            <button className="btn-ghost" onClick={() => updateActive((x) => setCourts(x, s.courts.length - 1))} disabled={s.courts.length <= 1 || !!s.courts[s.courts.length - 1].match}>− Court</button>
            <span className="text-slate-500">{s.courts.length} {s.courts.length === 1 ? 'court' : 'courts'}</span>
            <button className="btn-ghost" onClick={() => updateActive((x) => setCourts(x, s.courts.length + 1))}>+ Court</button>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Up next</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold dark:bg-slate-800">{waitingPlayers} waiting</span>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {waitingPlayers === 0 ? 'Everyone is on court.' : winners ? 'Waiting for a challenger.' : `Need ${Math.max(0, need * (s.config.format === 'teams' ? 1 : 1) - waiting.length)} more ${s.config.format === 'teams' ? 'teams' : 'players'} for the next game.`}
              </p>
            ) : (
              <ol className="space-y-2">
                {upcoming.map((m, i) => (
                  <li key={i} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                    <div className="mb-1 text-xs font-semibold text-slate-500">{i === 0 ? (freeCourts ? 'Going on now' : 'Next') : `Then #${i + 1}`}</div>
                    <div className="font-semibold">{join(m.a.map((id) => nameOf(s, id)))}</div>
                    {m.b ? (
                      <>
                        <div className="text-xs text-slate-400">vs</div>
                        <div className="font-semibold">{join(m.b.map((id) => nameOf(s, id)))}</div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-500">challenge the winners</div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {waiting.length > 0 && (
              <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                <div className="mb-1.5 text-xs font-semibold text-slate-500">Waiting line</div>
                <div className="flex flex-wrap gap-1.5">
                  {waiting.map((u) => (
                    <span key={u.key} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium dark:bg-slate-800">
                      {u.ids.map((id) => nameOf(s, id)).join(' & ')} <span className="text-slate-400">· {s.players.filter((p) => u.ids.includes(p.id)).reduce((n, p) => Math.max(n, gamesOf(p, counts)), 0)}</span>
                    </span>
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
      {subFor && <SubSheet s={s} courtId={subFor.court} outId={subFor.id} onClose={() => setSubFor(null)} />}
    </div>
  )
}

function CourtCard({ s, c, now, onScore, onSub }: { s: Session; c: Court; now: number; onScore: () => void; onSub: (id: string) => void }) {
  const m = c.match
  const winners = s.config.mode === 'winners'
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between bg-green-600 px-4 py-2 text-white">
        <h2 className="font-bold">{c.name}</h2>
        {m && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-100">
            {winners && m.streak > 0 && <span className="mr-1 flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5"><Crown size={12} /> {m.streak} in a row</span>}
            <Clock size={12} /> {elapsed(m.startedAt, now)}
          </span>
        )}
      </div>
      {m ? (
        <div className="p-3">
          <Side s={s} ids={m.a} onSub={(id) => onSub(id)} holders={winners && m.streak > 0} />
          <div className="my-2 flex items-center gap-3 text-xs font-bold tracking-widest text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /> VS <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>
          <Side s={s} ids={m.b} onSub={(id) => onSub(id)} />
          <button className="btn-primary mt-3 w-full !min-h-12 text-base" onClick={onScore}>Game finished</button>
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

function Side({ s, ids, onSub, holders }: { s: Session; ids: string[]; onSub: (id: string) => void; holders?: boolean }) {
  return (
    <div className={`grid gap-2 ${ids.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {ids.map((id) => (
        <button
          key={id}
          onClick={() => onSub(id)}
          title="Tap to swap this player"
          className={`min-h-12 truncate rounded-xl px-3 py-2 text-center text-base font-bold ${holders ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-slate-100 dark:bg-slate-800'}`}
        >
          {nameOf(s, id)}
        </button>
      ))}
    </div>
  )
}

function ScoreSheet({ s, court, onClose }: { s: Session; court: Court; onClose: () => void }) {
  const m = court.match!
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [quick, setQuick] = useState<'a' | 'b' | null>(null)
  const nameA = join(m.a.map((id) => nameOf(s, id)))
  const nameB = join(m.b.map((id) => nameOf(s, id)))
  const haveScores = a !== '' && b !== ''
  const error = haveScores ? validateScore(Number(a), Number(b), s.config) : null

  function done(r: Result) {
    updateActive((x) => finishMatch(x, court.id, r))
    onClose()
  }
  const submitScore = () => {
    if (!haveScores || error) return
    const sa = Number(a)
    const sb = Number(b)
    done({ winner: sa > sb ? 'a' : 'b', scoreA: sa, scoreB: sb })
  }

  return (
    <Sheet title={`${court.name}: who won?`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {(['a', 'b'] as const).map((side) => (
            <button key={side} onClick={() => setQuick(side)} className={`min-h-20 rounded-2xl border-2 p-3 text-center text-base font-bold transition ${quick === side ? 'border-green-600 bg-green-50 dark:bg-green-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
              {side === 'a' ? nameA : nameB}
              <span className="mt-1 block text-xs font-medium text-slate-500">won</span>
            </button>
          ))}
        </div>
        {quick && (
          <button className="btn-primary w-full !min-h-12" onClick={() => done({ winner: quick, scoreA: null, scoreB: null })}>
            Save: {quick === 'a' ? nameA : nameB} won
          </button>
        )}

        <div className="relative py-1 text-center text-xs font-semibold text-slate-400">
          <span className="bg-white px-2 dark:bg-slate-900">or enter the score (for point difference)</span>
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
            onClick={() => {
              if (confirm('Cancel this game without recording it? Everyone goes back to the queue.')) {
                updateActive((x) => cancelMatch(x, court.id))
                onClose()
              }
            }}
          >
            Cancel game
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function SubSheet({ s, courtId, outId, onClose }: { s: Session; courtId: string; outId: string; onClose: () => void }) {
  const waiting = waitingUnits(s).flatMap((u) => u.ids)
  const counts = countMatches(s.matches)
  const teams = s.config.format === 'teams'
  return (
    <Sheet title={`Swap ${nameOf(s, outId)}`} onClose={onClose}>
      <div className="space-y-3">
        {!teams && (
          <>
            <p className="text-sm text-slate-500">Pick who takes over on court:</p>
            {waiting.length === 0 && <p className="text-sm font-medium">Nobody is waiting.</p>}
            <div className="grid grid-cols-2 gap-2">
              {waiting.map((id) => (
                <button key={id} className="btn-soft" onClick={() => { updateActive((x) => substitute(x, courtId, outId, id)); onClose() }}>
                  {nameOf(s, id)} <span className="text-xs font-normal text-slate-500">· {gamesOf(s.players.find((p) => p.id === id)!, counts)}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <button className="btn-soft flex-1" onClick={() => { updateActive((x) => setStatus(x, outId, 'resting')); onClose() }}><Moon size={16} /> Take a break</button>
          <button className="btn-ghost flex-1 text-red-600" onClick={() => { if (confirm(`${nameOf(s, outId)} has left for the day?`)) { updateActive((x) => setStatus(x, outId, 'left')); onClose() } }}>Left</button>
        </div>
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
            <input className="input" placeholder={teams ? 'Player 1' : 'Name'} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            {teams && <input className="input" placeholder="Player 2" value={name2} onChange={(e) => setName2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />}
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
                  className="block max-w-full truncate text-left font-semibold"
                  onClick={() => {
                    const n = prompt('Rename player', p.name)
                    if (n) updateActive((x) => renamePlayer(x, p.id, n))
                  }}
                >
                  {p.name}
                </button>
                <div className="text-xs text-slate-500">
                  {gamesOf(p, counts)} games{onCourt.has(p.id) ? ' · on court' : ''}{p.status !== 'active' ? ` · ${p.status === 'resting' ? 'on a break' : 'left'}` : ''}
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
