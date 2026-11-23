import { useState } from 'react'
import { CircleDot, Flag, History as HistoryIcon, Home as HomeIcon, Plus, Trophy } from 'lucide-react'
import { endSession } from './engine/session'
import { MODE_INFO, type Session } from './engine/types'
import { openSession, updateActive, useData } from './store'
import { fmtDate } from './lib/util'
import { useWakeLock } from './lib/util'
import Setup from './components/Setup'
import Live from './components/Live'
import Standings from './components/Standings'
import History from './components/History'
import Summary from './components/Summary'
import ThemeSwitch from './components/ThemeSwitch'

type Tab = 'live' | 'standings' | 'history'

export default function App() {
  const { sessions, activeId } = useData()
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<Tab>('live')
  const active = sessions.find((s) => s.id === activeId) ?? null

  useWakeLock(!!active && !active.endedAt)

  if (creating) return <Setup onCancel={() => setCreating(false)} />
  if (active?.endedAt) return <Summary s={active} onBack={() => openSession(null)} />
  if (!active) return <Home onNew={() => setCreating(true)} />
  return <Shell s={active} tab={tab} setTab={setTab} />
}

function Shell({ s, tab, setTab }: { s: Session; tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: typeof Flag }[] = [
    { id: 'live', label: 'Courts', icon: CircleDot },
    { id: 'standings', label: 'Standings', icon: Trophy },
    { id: 'history', label: 'History', icon: HistoryIcon },
  ]
  function finish() {
    const n = s.matches.length
    const msg = n === 0 ? 'End this session? No games have been recorded.' : `End the session and see final results? ${n} games will be saved.`
    if (confirm(msg)) updateActive((x) => endSession(x))
  }
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <nav className="sticky top-0 z-20 hidden w-56 shrink-0 flex-col gap-1 self-start border-r border-slate-200 bg-white p-3 md:flex md:h-dvh dark:border-slate-800 dark:bg-slate-900">
        <button className="mb-2 px-2 text-left" onClick={() => openSession(null)} title="All sessions">
          <div className="text-xl font-extrabold text-green-600">Paddl</div>
          <div className="truncate text-xs text-slate-500">{s.name}</div>
          <div className="text-[11px] text-slate-400">{MODE_INFO[s.config.mode].label}</div>
        </button>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${tab === t.id ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            <t.icon size={18} /> {t.label}
          </button>
        ))}
        <div className="mt-auto space-y-1">
          <div className="pb-1"><ThemeSwitch /></div>
          <button className="btn-ghost w-full justify-start" onClick={() => openSession(null)}><HomeIcon size={18} /> All sessions</button>
          <button className="btn-danger w-full" onClick={finish}><Flag size={18} /> End session</button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/95">
          <button className="min-w-0 text-left" onClick={() => openSession(null)}>
            <div className="truncate text-base font-extrabold leading-tight">{s.name}</div>
            <div className="text-[11px] text-slate-500">{MODE_INFO[s.config.mode].label} · tap for all sessions</div>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeSwitch compact />
            <button className="btn-danger !min-h-9 !px-3" onClick={finish}><Flag size={16} /> End</button>
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">
          {tab === 'live' && <Live s={s} />}
          {tab === 'standings' && <Standings s={s} />}
          {tab === 'history' && <History s={s} />}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-slate-800 dark:bg-slate-900">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${tab === t.id ? 'text-green-600' : 'text-slate-500'}`}>
              <t.icon size={22} /> {t.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

function Home({ onNew }: { onNew: () => void }) {
  const { sessions } = useData()
  const live = sessions.filter((s) => !s.endedAt)
  const past = sessions.filter((s) => s.endedAt)
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-16">
      <div className="mb-4 flex justify-end"><ThemeSwitch /></div>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-green-600 text-3xl shadow-lg">🥒</div>
        <h1 className="text-4xl font-extrabold tracking-tight">Paddl</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">Fair pickleball queues for open play. Works offline.</p>
      </div>
      <button className="btn-primary w-full !min-h-14 text-base" onClick={onNew}><Plus size={22} /> New session</button>

      {live.length > 0 && (
        <section className="mt-8">
          <h2 className="label">In progress</h2>
          <div className="space-y-2">{live.map((s) => <Row key={s.id} s={s} live />)}</div>
        </section>
      )}
      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="label">Past sessions</h2>
          <div className="space-y-2">{past.map((s) => <Row key={s.id} s={s} />)}</div>
        </section>
      )}
      {sessions.length === 0 && (
        <ul className="mt-8 space-y-2 text-sm text-slate-500 dark:text-slate-400">
          <li>1. Add your players and pick how you want to match them.</li>
          <li>2. Tap <b>Game finished</b> on a court and pick the winner. The next game starts automatically.</li>
          <li>3. End the session to get final standings and an image to share.</li>
        </ul>
      )}
    </div>
  )
}

function Row({ s, live }: { s: Session; live?: boolean }) {
  return (
    <button className="card flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => openSession(s.id)}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{s.name}</div>
        <div className="text-xs text-slate-500">{fmtDate(s.createdAt)} · {s.players.length} players · {s.matches.length} games · {MODE_INFO[s.config.mode].label}</div>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${live ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{live ? 'Resume' : 'Results'}</span>
    </button>
  )
}
