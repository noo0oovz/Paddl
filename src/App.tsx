import { useState } from 'react'
import { CircleDot, Flag, HardDriveDownload, HelpCircle, Smartphone, History as HistoryIcon, Home as HomeIcon, Plus, Trophy } from 'lucide-react'
import { endSession } from './engine/session'
import { MODE_INFO, type Session } from './engine/types'
import { damagedAtStartup, openSession, updateActive, useData } from './store'
import { fmtDate } from './lib/util'
import { useWakeLock } from './lib/util'
import Setup from './components/Setup'
import Live from './components/Live'
import Standings from './components/Standings'
import History from './components/History'
import Summary from './components/Summary'
import ThemeSwitch from './components/ThemeSwitch'
import Help from './components/Help'
import DataSheet from './components/DataSheet'
import InstallGuide from './components/InstallGuide'
import { currentEnv } from './lib/install'
import UpdateBanner from './components/UpdateBanner'
import { useConfirm } from './components/Confirm'
import MoreMenu from './components/MoreMenu'
import Tour, { tourSeen } from './components/Tour'
import { CourtLines, Logo } from './components/art'
import UndoButton, { SaveStatus } from './components/UndoButton'

type Tab = 'live' | 'standings' | 'history'

export default function App() {
  const { sessions, activeId } = useData()
  const [creating, setCreating] = useState(false)
  const [help, setHelp] = useState(false)
  const [data, setData] = useState(false)
  const [install, setInstall] = useState(false)
  const [tour, setTour] = useState(() => !tourSeen())
  const [tab, setTab] = useState<Tab>('live')
  const active = sessions.find((s) => s.id === activeId) ?? null

  useWakeLock(!!active && !active.endedAt)

  let screen
  if (creating) screen = <Setup onCancel={() => setCreating(false)} />
  else if (active?.endedAt) screen = <Summary s={active} onBack={() => openSession(null)} />
  else if (!active) screen = <Home onNew={() => setCreating(true)} onHelp={() => setHelp(true)} onData={() => setData(true)} onInstall={() => setInstall(true)} />
  else screen = <Shell s={active} tab={tab} setTab={setTab} onHelp={() => setHelp(true)} onData={() => setData(true)} onInstall={() => setInstall(true)} />
  return (
    <>
      {screen}
      {help && <Help onClose={() => setHelp(false)} onTour={() => setTour(true)} onInstall={() => setInstall(true)} />}
      {data && <DataSheet onClose={() => setData(false)} />}
      {install && <InstallGuide onClose={() => setInstall(false)} />}
      <UpdateBanner />
      {tour && <Tour onDone={() => setTour(false)} />}
    </>
  )
}

function Shell({ s, tab, setTab, onHelp, onData, onInstall }: { s: Session; tab: Tab; setTab: (t: Tab) => void; onHelp: () => void; onData: () => void; onInstall: () => void }) {
  const tabs: { id: Tab; label: string; icon: typeof Flag }[] = [
    { id: 'live', label: 'Courts', icon: CircleDot },
    { id: 'standings', label: 'Standings', icon: Trophy },
    { id: 'history', label: 'History', icon: HistoryIcon },
  ]
  const { ask, dialog } = useConfirm()
  function finish() {
    const n = s.matches.length
    ask({
      title: 'End this session?',
      body: n === 0 ? 'No games have been recorded yet.' : `You will see the final results, standings and pictures to share. ${n} ${n === 1 ? 'game is' : 'games are'} saved, and you can reopen the session if you end it by mistake.`,
      confirmLabel: 'End session',
      danger: true,
      onConfirm: () => updateActive((x) => endSession(x)),
    })
  }
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {dialog}
      <nav className="sticky top-0 z-20 hidden w-56 shrink-0 flex-col gap-1 self-start border-r border-slate-200 bg-white/70 p-3 backdrop-blur-xl md:flex md:h-dvh dark:border-white/10 dark:bg-slate-950/60">
        <button className="mb-2 px-2 text-left" onClick={() => openSession(null)} title="All sessions">
          <div className="text-xl font-black tracking-tight text-brand">PADDL</div>
          <div className="truncate text-xs text-slate-500">{s.name}</div>
          <div className="text-xs text-slate-400">{MODE_INFO[s.config.mode].label}</div>
        </button>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${tab === t.id ? 'bg-accent text-accent-ink shadow-[0_6px_20px_-8px_rgba(182,255,59,0.7)]' : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10'}`}>
            <t.icon size={18} /> {t.label}
          </button>
        ))}
        <div className="mt-auto space-y-1">
          <button className="btn-ghost w-full justify-start" onClick={onHelp}><HelpCircle size={18} /> How to use</button>
          <button className="btn-ghost w-full justify-start" onClick={onInstall}><Smartphone size={18} /> Add to home screen</button>
          <button className="btn-ghost w-full justify-start" onClick={onData}><HardDriveDownload size={18} /> Backup and restore</button>
          <UndoButton full />
          <SaveStatus className="block px-1 pb-1" />
          <div className="pb-1"><ThemeSwitch /></div>
          <button className="btn-ghost w-full justify-start" onClick={() => openSession(null)}><HomeIcon size={18} /> All sessions</button>
          <button className="btn-danger w-full" onClick={finish}><Flag size={18} /> End session</button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/75 px-4 py-2 backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-slate-950/70">
          <button className="min-w-0 text-left" onClick={() => openSession(null)}>
            <div className="truncate text-base font-extrabold leading-tight">{s.name}</div>
            <div className="truncate text-xs text-slate-500">{MODE_INFO[s.config.mode].label}</div>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <UndoButton />
            <MoreMenu onHelp={onHelp} onHome={() => openSession(null)} onData={onData} onInstall={onInstall} />
            <button className="btn-danger !min-h-9 !px-3" onClick={finish}><Flag size={16} /> End</button>
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">
          {tab === 'live' && <Live s={s} />}
          {tab === 'standings' && <Standings s={s} />}
          {tab === 'history' && <History s={s} />}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-slate-200 bg-white/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-slate-950/75">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${tab === t.id ? 'text-brand' : 'text-slate-500'}`}>
              <t.icon size={22} /> {t.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

function Home({ onNew, onHelp, onData, onInstall }: { onNew: () => void; onHelp: () => void; onData: () => void; onInstall: () => void }) {
  // Offer the install card on phones and tablets that have not installed Paddl yet.
  const env = currentEnv()
  const showInstall = env.platform !== 'desktop' && !env.installed
  const { sessions } = useData()
  const live = sessions.filter((s) => !s.endedAt)
  const past = sessions.filter((s) => s.endedAt)
  const [resume, ...otherLive] = live
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-16">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-2">
          <button className="btn-soft !min-h-10 whitespace-nowrap" onClick={onHelp} aria-label="How to use" title="How to use"><HelpCircle size={18} /> <span className="hidden min-[430px]:inline">How to use</span></button>
          <button className="btn-soft !min-h-10" onClick={onData} aria-label="Backup and restore" title="Backup and restore"><HardDriveDownload size={18} /></button>
        </div>
        <ThemeSwitch />
      </div>

      {damagedAtStartup > 0 && (
        <div role="alert" className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {damagedAtStartup} saved {damagedAtStartup === 1 ? 'session was' : 'sessions were'} damaged and set aside so Paddl could open. Nothing else was lost.
        </div>
      )}
      {resume && (
        <section className="card mt-3 border-accent/40 p-4">
          <h2 className="label">Pick up where you left off</h2>
          <button className="flex w-full items-center gap-3 text-left" onClick={() => openSession(resume.id)}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-black">{resume.name}</span>
              <span className="block text-sm text-slate-500 dark:text-slate-400">{resume.players.length} players · {resume.matches.length} {resume.matches.length === 1 ? 'game' : 'games'} played · {MODE_INFO[resume.config.mode].label}</span>
            </span>
            <span className="btn-primary !min-h-12 shrink-0 px-5">Resume</span>
          </button>
        </section>
      )}
      <section className="card relative mt-3 overflow-hidden px-5 pt-8 pb-7 text-center">
        <CourtLines className="pointer-events-none absolute inset-x-6 bottom-0 h-24 w-[calc(100%-3rem)] text-slate-400/20 [mask-image:linear-gradient(to_top,#000,transparent)] dark:text-accent/15" />
        <div className="relative">
          <div className="mx-auto w-fit"><Logo size={84} /></div>
          <h1 className="mt-3 text-5xl font-black tracking-tight drop-shadow-[0_2px_12px_var(--bg)]">PADDL</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-slate-600 dark:text-slate-300">Fair pickleball queues for open play.<br />No sign-up. Works offline.</p>
          <button className={`${resume ? 'btn-soft' : 'btn-primary'} mt-6 w-full !min-h-14 text-base`} onClick={onNew}><Plus size={22} /> New session</button>
        </div>
      </section>

      {otherLive.length > 0 && (
        <section className="mt-8">
          <h2 className="label">🟢 Also in progress</h2>
          <div className="space-y-2">{otherLive.map((s) => <Row key={s.id} s={s} live />)}</div>
        </section>
      )}
      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="label">🏆 Past sessions</h2>
          <div className="space-y-2">{past.map((s) => <Row key={s.id} s={s} />)}</div>
        </section>
      )}
      {showInstall && (
        <button className="card mt-6 flex w-full items-center gap-3 border-accent/30 p-4 text-left transition hover:border-accent/60" onClick={onInstall}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-brand"><Smartphone size={22} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-black">Add Paddl to your home screen</span>
            <span className="block text-sm text-slate-500 dark:text-slate-400">One tap to open, full screen, works offline.</span>
          </span>
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-black text-accent-ink">Show me how</span>
        </button>
      )}
      {sessions.length === 0 && (
        <section className="mt-8">
          <h2 className="label">How it works</h2>
          <ol className="grid gap-2 sm:grid-cols-3">
            {[
              ['👥', 'Add players', 'Paste your list and pick your courts and a mode.'],
              ['🏆', 'Tap the winner', 'When a game ends, tap the green button for the winning team. The next match starts itself.'],
              ['📸', 'Share the recap', 'End the session for standings, history and images for the group chat.'],
            ].map(([e, title, text], i) => (
              <li key={title} className="card p-4">
                <div className="flex items-center gap-2"><span className="text-2xl">{e}</span><span className="text-xs font-bold text-slate-400">STEP {i + 1}</span></div>
                <div className="mt-1 font-bold">{title}</div>
                <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{text}</div>
              </li>
            ))}
          </ol>
        </section>
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
