import { useMemo, useState } from 'react'
import { ArrowLeft, Play, Plus, X } from 'lucide-react'
import { createSession, sessionReady, type NewPlayer } from '../engine/session'
import { DEFAULT_CONFIG, FORMAT_INFO, MODE_INFO, type Config, type Format, type Mode } from '../engine/types'
import { addSession, useData } from '../store'
import { Segmented, Stepper, Toggle } from './ui'
import ThemeSwitch from './ThemeSwitch'
import { isEnter } from '../lib/util'

const LEVELS = [2.5, 3, 3.5, 4, 4.5, 5]

function parseNames(text: string): string[] {
  return text.split(/[\n,;]+/).map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean)
}

export default function Setup({ onCancel }: { onCancel: () => void }) {
  const { roster } = useData()
  const [name, setName] = useState('')
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG)
  const [players, setPlayers] = useState<NewPlayer[]>([])
  const [pairs, setPairs] = useState<[NewPlayer, NewPlayer][]>([])
  const [draft, setDraft] = useState('')
  const [pairDraft, setPairDraft] = useState<[string, string]>(['', ''])
  const [advanced, setAdvanced] = useState(false)
  const set = (patch: Partial<Config>) => setCfg((c) => ({ ...c, ...patch }))

  const isTeams = cfg.format === 'teams'
  const taken = useMemo(() => new Set([...players.map((p) => p.name), ...pairs.flat().map((p) => p.name)].map((n) => n.toLowerCase())), [players, pairs])
  const MAX_PLAYERS = 80
  const [note, setNote] = useState<string | null>(null)
  const skill = cfg.mode === 'skill'

  /** The people a block of typed or pasted text would add (new names only, within the cap). */
  function freshFrom(text: string, already: NewPlayer[] = players): NewPlayer[] {
    const fresh: NewPlayer[] = []
    const seen = new Set([...taken, ...already.map((p) => p.name.toLowerCase())])
    for (const raw of parseNames(text)) {
      const n = raw.slice(0, 30).trim() // cut BEFORE the duplicate check, so two long names that share their first 30 letters are one name
      if (!n || seen.has(n.toLowerCase())) continue
      seen.add(n.toLowerCase())
      const known = roster.find((r) => r.name.toLowerCase() === n.toLowerCase())
      fresh.push({ name: n, level: known?.level ?? 3.5 })
    }
    return fresh
  }

  function addNames(text: string) {
    const fresh = freshFrom(text, [])
    const room = Math.max(0, MAX_PLAYERS - players.length)
    if (fresh.length > room) setNote(`Up to ${MAX_PLAYERS} players per session. ${fresh.length - room} not added.`)
    else setNote(null)
    if (fresh.length) setPlayers((p) => [...p, ...fresh.slice(0, room)])
    setDraft('')
  }

  // A name typed but not yet confirmed with Enter still counts: tapping Start must not silently drop it.
  const pendingPlayers = isTeams ? [] : freshFrom(draft, []).slice(0, Math.max(0, MAX_PLAYERS - players.length))
  const pendingPair = (() => {
    const [x, y] = pairDraft.map((n) => n.trim().replace(/\s+/g, ' ').slice(0, 30).trim())
    if (!isTeams || !x || !y || x.toLowerCase() === y.toLowerCase() || taken.has(x.toLowerCase()) || taken.has(y.toLowerCase())) return null
    return [x, y] as const
  })()
  const allPlayers = [...players, ...pendingPlayers]
  const allPairs = pendingPair ? [...pairs, [{ name: pendingPair[0], level: roster.find((r) => r.name.toLowerCase() === pendingPair[0].toLowerCase())?.level ?? 3.5 }, { name: pendingPair[1], level: roster.find((r) => r.name.toLowerCase() === pendingPair[1].toLowerCase())?.level ?? 3.5 }] as [NewPlayer, NewPlayer]] : pairs
  const problem = sessionReady(cfg, allPlayers.length, allPairs.length)

  function addPair() {
    const [x, y] = pairDraft.map((n) => n.trim().replace(/\s+/g, ' ').slice(0, 30))
    if (!x || !y) return
    if (x.toLowerCase() === y.toLowerCase()) { setNote('A team needs two different people.'); return }
    const twice = [x, y].find((n) => taken.has(n.toLowerCase()))
    if (twice) { setNote(`${twice} is already on a team.`); return }
    setNote(null)
    const lv = (n: string) => roster.find((r) => r.name.toLowerCase() === n.toLowerCase())?.level ?? 3.5
    setPairs((p) => [...p, [{ name: x, level: lv(x) }, { name: y, level: lv(y) }]])
    setPairDraft(['', ''])
  }

  function start() {
    if (problem) return
    addSession(createSession(name.trim().slice(0, 60), { ...cfg, challengerCourt: cfg.courts >= 2 ? cfg.challengerCourt : false }, allPlayers, allPairs))
    onCancel() // leave the setup screen; the new session is now the active one
  }

  const suggestions = roster.filter((r) => !taken.has(r.name.toLowerCase())).slice(0, 14)
  const dupe = taken.has(draft.trim().replace(/\s+/g, ' ').toLowerCase())

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-32">
      <div className="mb-2 flex items-center justify-between">
        <button className="btn-ghost -ml-3" onClick={onCancel}><ArrowLeft size={18} /> Back</button>
        <ThemeSwitch />
      </div>
      <h1 className="text-2xl font-extrabold">New session</h1>

      <div className="mt-5 space-y-5">
        <section className="card p-4">
          <label className="label" htmlFor="sname">Session name</label>
          <input id="sname" className="input" placeholder="Saturday open play" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </section>

        <section className="card space-y-4 p-4">
          <div>
            <div className="label">Format</div>
            <Segmented<Format>
              value={cfg.format}
              onChange={(f) => set({ format: f })}
              options={(Object.keys(FORMAT_INFO) as Format[]).map((f) => ({ value: f, label: FORMAT_INFO[f].label, sub: FORMAT_INFO[f].blurb }))}
            />
          </div>
          <div>
            <div className="label">How players are matched</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set({ mode: m })}
                  aria-pressed={cfg.mode === m}
                  className={`rounded-xl border p-3 text-left transition ${
                    cfg.mode === m ? 'border-green-600 bg-green-50 ring-2 ring-green-600/30 dark:bg-green-950/40' : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="text-sm font-bold">{MODE_INFO[m].label}{m === 'fair' && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">Recommended</span>}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{MODE_INFO[m].blurb}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="label !mb-0">Courts</div>
            <Stepper label="courts" value={cfg.courts} min={1} max={12} onChange={(n) => set(n < 2 ? { courts: n, challengerCourt: false } : { courts: n })} />
          </div>
          <div>
            <div className="label">Play to</div>
            <Segmented<number> value={cfg.target} onChange={(n) => set({ target: n })} options={[11, 15, 21].map((n) => ({ value: n, label: String(n) }))} />
          </div>
          <button type="button" className="inline-flex min-h-11 items-center text-sm font-semibold text-green-700 dark:text-green-400" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
            {advanced ? 'Hide' : 'Show'} more rules
          </button>
          {advanced && (
            <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
              <Toggle checked={cfg.winBy2} onChange={(b) => set({ winBy2: b })} label="Win by 2" hint="Turn off for rally-style first-to-target" />
              {cfg.mode !== 'winners' && cfg.courts >= 2 && (
                <Toggle checked={!!cfg.challengerCourt} onChange={(b) => set({ challengerCourt: b })} label="Challenger court" hint="Court 1 keeps the winners on and announces win streaks. Other courts rotate as normal" />
              )}
              {(cfg.mode === 'winners' || cfg.challengerCourt) && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">Max wins in a row</div>
                    <div className="text-xs text-slate-500">Winners leave the court after this many</div>
                  </div>
                  <Stepper label="wins in a row" value={cfg.maxStreak} min={1} max={10} onChange={(n) => set({ maxStreak: n })} />
                </div>
              )}
              {(cfg.mode === 'winners' || cfg.challengerCourt) && cfg.format === 'doubles' && (
                <Toggle checked={!!cfg.winnersSplit} onChange={(b) => set({ winnersSplit: b })} label="Split the winners" hint="Winners go to opposite sides and each partners a newcomer. Off keeps the winning pair together" />
              )}
              <Toggle checked={cfg.lateJoinMedian} onChange={(b) => set({ lateJoinMedian: b })} label="Fair late joins" hint="Late arrivals start at the average games played so they do not hog courts" />
              <Toggle checked={(cfg.maxInRow ?? 0) > 0} onChange={(b) => set({ maxInRow: b ? 2 : 0 })} label="Limit games in a row" hint="After 2 games in a row, someone who sat out goes first among players with the same number of games. Never leaves a court empty" />
              <Toggle checked={cfg.breakReturn === 'back'} onChange={(b) => set({ breakReturn: b ? 'back' : 'keep' })} label="Back of the line after a break" hint="Off: someone returning from a break comes back level with the group. On: they also wait behind everyone already in line for their first game" />
            </div>
          )}
        </section>

        <section className="card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="label !mb-0">{isTeams ? `Teams (${pairs.length})` : `Players (${players.length})`}</div>
            {problem && <div className="text-xs font-semibold text-amber-800 dark:text-amber-400">{problem}</div>}
          </div>
          {note && <div role="status" className="mb-2 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{note}</div>}

          {isTeams ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Player 1" aria-label="Player 1 name" maxLength={30} value={pairDraft[0]} onChange={(e) => setPairDraft([e.target.value, pairDraft[1]])} />
                <input className="input" placeholder="Player 2" aria-label="Player 2 name" maxLength={30} value={pairDraft[1]} onChange={(e) => setPairDraft([pairDraft[0], e.target.value])} onKeyDown={(e) => isEnter(e) && addPair()} />
              </div>
              <button className="btn-soft w-full" onClick={addPair} disabled={!pairDraft[0].trim() || !pairDraft[1].trim()}><Plus size={18} /> Add team</button>
              <ul className="space-y-1.5 pt-1">
                {pairs.map(([x, y], i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium dark:bg-slate-800">
                    <span>{x.name} &amp; {y.name}</span>
                    <button className="-my-1 -mr-2 grid h-11 w-11 place-items-center text-slate-500 hover:text-red-600" onClick={() => setPairs((p) => p.filter((_, j) => j !== i))} aria-label={`Remove team ${x.name} and ${y.name}`}><X size={18} /></button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Type a name, then Enter"
                  aria-label="Player name"
                  maxLength={400}
                  value={draft}
                  autoCapitalize="words"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => isEnter(e) && addNames(draft)}
                  onPaste={(e) => {
                    const t = e.clipboardData.getData('text')
                    if (/[\n,;]/.test(t)) { e.preventDefault(); addNames(t) }
                  }}
                />
                <button className="btn-primary !px-4" onClick={() => addNames(draft)} disabled={!draft.trim() || dupe} aria-label="Add player"><Plus size={20} /></button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Tip: paste a whole list (one name per line) to add everyone at once.</p>
              {suggestions.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 text-xs font-semibold text-slate-500">Regulars</div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((r) => (
                      <button key={r.name} className="rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => setPlayers((p) => [...p, { name: r.name, level: r.level }])}>
                        + {r.name}
                      </button>
                    ))}
                    {suggestions.length > 1 && (
                      <button className="rounded-full bg-green-100 px-3 py-1.5 text-sm font-semibold text-green-800 dark:bg-green-950 dark:text-green-300" onClick={() => setPlayers((p) => [...p, ...suggestions.map((r) => ({ name: r.name, level: r.level }))])}>
                        Add all
                      </button>
                    )}
                  </div>
                </div>
              )}
              <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
                {players.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 text-sm font-medium dark:bg-slate-800">
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {skill && (
                      <select
                        aria-label={`${p.name} level`}
                        className="rounded-lg border border-slate-300 bg-white px-1 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                        value={p.level}
                        onChange={(e) => setPlayers((arr) => arr.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) } : x)))}
                      >
                        {LEVELS.map((l) => <option key={l} value={l}>{l.toFixed(1)}</option>)}
                      </select>
                    )}
                    <button className="-my-1 -mr-2 grid h-11 w-11 shrink-0 place-items-center text-slate-500 hover:text-red-600" onClick={() => setPlayers((arr) => arr.filter((_, j) => j !== i))} aria-label={`Remove ${p.name}`}><X size={18} /></button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto max-w-2xl">
          <button className="btn-primary w-full !min-h-12 text-base" disabled={!!problem} onClick={start}>
            <Play size={20} /> Start session
          </button>
        </div>
      </div>
    </div>
  )
}
