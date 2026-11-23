import { useState } from 'react'
import { Check, Copy, EllipsisVertical, MonitorSmartphone, PlusSquare, Share, Smartphone, Tablet } from 'lucide-react'
import { currentEnv, installOneTap, useCanInstallOneTap, type Env, type Platform } from '../lib/install'
import { PaddleBall } from './art'
import { Sheet } from './ui'

type Which = 'iphone' | 'ipad' | 'android' | 'tablet'

/** One numbered step with a small picture of the control to look for. */
function Step({ n, icon, title, text }: { n: number; icon: React.ReactNode; title: string; text: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-slate-200 bg-white/50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-black text-accent-ink">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="font-bold">{title}</div>
        <div className="mt-0.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{text}</div>
      </div>
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900/5 text-slate-700 dark:bg-white/10 dark:text-slate-200" aria-hidden>{icon}</div>
    </li>
  )
}

const Btn = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md bg-slate-900/10 px-1.5 py-0.5 text-[13px] font-bold text-slate-900 dark:bg-white/15 dark:text-white">{children}</span>
)

/** The device the person is most likely holding, used to open the right tab first. */
function defaultTab(p: Platform): Which {
  return p === 'ios' ? 'iphone' : p === 'ipad' ? 'ipad' : p === 'android' ? 'android' : 'iphone'
}

function IosSteps({ ipad }: { ipad: boolean }) {
  return (
    <ol className="space-y-2.5">
      <Step
        n={1}
        icon={<Share size={22} />}
        title="Tap the Share button"
        text={ipad
          ? <>In Safari, it is the square with an arrow <Btn>Share</Btn> in the <b>top bar</b>, next to the address.</>
          : <>In Safari, it is the square with an arrow <Btn>Share</Btn> at the <b>bottom</b> of the screen. (If you cannot see it, tap the address bar or scroll up a little.)</>}
      />
      <Step n={2} icon={<PlusSquare size={22} />} title="Choose “Add to Home Screen”" text={<>Scroll down the list of options and tap <Btn>Add to Home Screen</Btn>. If you do not see it, scroll further or tap <Btn>Edit Actions</Btn>.</>} />
      <Step n={3} icon={<Check size={22} />} title="Tap “Add”" text={<>Keep the name <b>Paddl</b> (or change it) and tap <Btn>Add</Btn> in the top corner.</>} />
      <Step n={4} icon={<PaddleBall size={26} glow={false} />} title="Open it from your home screen" text="Paddl now opens full screen like an app, works with no signal, and keeps your sessions saved." />
    </ol>
  )
}

function AndroidSteps({ tablet }: { tablet: boolean }) {
  return (
    <ol className="space-y-2.5">
      <Step n={1} icon={<EllipsisVertical size={22} />} title="Open the browser menu" text={<>In Chrome, tap the three dots <Btn>⋮</Btn> {tablet ? 'at the top right of the screen' : 'at the top right (or the bottom, in some versions)'}.</>} />
      <Step n={2} icon={<PlusSquare size={22} />} title="Tap “Install app” or “Add to Home screen”" text={<>You will see <Btn>Install app</Btn> or <Btn>Add to Home screen</Btn>. Samsung Internet shows a <Btn>+</Btn> in the menu bar.</>} />
      <Step n={3} icon={<Check size={22} />} title="Confirm" text={<>Tap <Btn>Install</Btn> (or <Btn>Add</Btn>) in the box that appears.</>} />
      <Step n={4} icon={<PaddleBall size={26} glow={false} />} title="Open it from your home screen" text="Look for the Paddl paddle-and-ball icon. It opens full screen and works offline." />
    </ol>
  )
}

/** Tells iPhone/iPad users who opened Paddl in Chrome or an in-app browser to reopen it in Safari. */
function SafariNotice({ env }: { env: Env }) {
  const [copied, setCopied] = useState(false)
  if (!env.needsSafari) return null
  const url = typeof location !== 'undefined' ? location.href.split('#')[0] : ''
  return (
    <div role="alert" className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="font-black">Open this page in Safari first</div>
      <p className="mt-1 leading-relaxed">
        iPhones and iPads only let <b>Safari</b> add websites to the home screen. You are in {env.browser === 'chrome' ? 'Chrome' : env.browser === 'firefox' ? 'Firefox' : env.browser === 'edge' ? 'Edge' : 'another app'}. Copy the link, open Safari, and paste it in.
      </p>
      <button
        className="btn-soft mt-2 !min-h-10 w-full"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
          } catch {
            window.prompt('Copy this link, then open it in Safari:', url)
          }
        }}
      >
        {copied ? <><Check size={16} /> Link copied. Now open Safari</> : <><Copy size={16} /> Copy the link</>}
      </button>
    </div>
  )
}

/** "Add Paddl to your home screen": steps for iPhone, iPad, Android phone and Android tablet. */
export default function InstallGuide({ onClose }: { onClose: () => void }) {
  const env = currentEnv()
  const oneTap = useCanInstallOneTap()
  const [which, setWhich] = useState<Which>(defaultTab(env.platform))
  const [result, setResult] = useState<string | null>(null)

  const tabs: { id: Which; label: string; icon: React.ReactNode }[] = [
    { id: 'iphone', label: 'iPhone', icon: <Smartphone size={16} /> },
    { id: 'ipad', label: 'iPad', icon: <Tablet size={16} /> },
    { id: 'android', label: 'Android phone', icon: <Smartphone size={16} /> },
    { id: 'tablet', label: 'Android tablet', icon: <Tablet size={16} /> },
  ]
  const apple = which === 'iphone' || which === 'ipad'
  // Only warn about Safari when the person is actually on an Apple device (not when reading another tab's steps).
  const onApple = env.platform === 'ios' || env.platform === 'ipad'

  return (
    <Sheet title="Add Paddl to your home screen" onClose={onClose}>
      <div className="space-y-3">
        {env.installed ? (
          <div role="status" className="rounded-2xl bg-accent/15 p-3 text-sm font-semibold text-brand">
            ✅ You are already using Paddl from your home screen. Nothing to do.
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Put Paddl on your home screen to open it in one tap, full screen, with no browser bars. It works offline and keeps your sessions saved.
          </p>
        )}

        {env.platform === 'desktop' && !env.installed && (
          <div className="flex items-start gap-2 rounded-2xl bg-slate-900/5 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
            <MonitorSmartphone size={18} className="mt-0.5 shrink-0" />
            <span>You are on a computer. On a phone or tablet, open this same web address and follow the steps for your device below.</span>
          </div>
        )}

        {!env.installed && oneTap && (
          <div className="rounded-2xl border border-accent/40 bg-accent/10 p-3">
            <div className="font-bold">One tap install</div>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">Your browser can install Paddl right now.</p>
            <button
              className="btn-primary mt-2 w-full !min-h-12"
              onClick={async () => setResult((await installOneTap()) ? 'Installed. Look for Paddl on your home screen.' : 'No problem. You can install it any time from here.')}
            >
              <PlusSquare size={18} /> Install Paddl
            </button>
          </div>
        )}
        {result && <div className="rounded-2xl bg-accent/15 p-3 text-sm font-semibold text-brand" role="status">{result}</div>}

        <div role="tablist" aria-label="Choose your device" className="grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-200 bg-slate-100/60 p-1 sm:grid-cols-4 dark:border-white/10 dark:bg-white/5">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={which === t.id}
              onClick={() => setWhich(t.id)}
              className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition ${which === t.id ? 'bg-accent text-accent-ink shadow-sm' : 'text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {apple && onApple && <SafariNotice env={env} />}
        {apple && !onApple && (
          <p className="text-xs text-slate-500 dark:text-slate-400">These steps are for Safari on {which === 'iphone' ? 'an iPhone' : 'an iPad'}.</p>
        )}

        <div role="tabpanel">{apple ? <IosSteps ipad={which === 'ipad'} /> : <AndroidSteps tablet={which === 'tablet'} />}</div>

        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Tip: do this once, before your session, while you have signal. After that Paddl opens even with no internet at the courts.
        </p>
      </div>
    </Sheet>
  )
}
