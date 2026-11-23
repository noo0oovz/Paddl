import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Illustration, Logo, PaddleBall } from './art'

const KEY = 'paddl:tour'

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done'
  } catch {
    return true // if storage is unavailable, never nag
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(KEY, 'done')
  } catch {
    /* ignore */
  }
}

const STEPS: { emoji: string; title: string; text: string; scene: 'start' | 'games' | 'players' | 'free' | 'logo' }[] = [
  { emoji: '👋', title: 'Welcome to Paddl', text: 'Run fair pickleball open play from your phone. No sign-up, and it works with no signal.', scene: 'logo' },
  { emoji: '👥', title: 'Add players, pick a mode', text: 'Paste your list of names, choose your courts and a mode. Fair rotation is the easy default.', scene: 'players' },
  { emoji: '🏆', title: 'Tap the winner. That is it.', text: 'When a game ends, tap the button for the winning team. The next match starts by itself.', scene: 'games' },
  { emoji: '📺', title: 'Show the Board', text: 'Put the Board on a tablet or TV so everyone sees who is on deck. You can tap winners there too.', scene: 'free' },
  { emoji: '📸', title: 'End with a recap', text: 'Tap End for standings, games played, history and pictures to share in the group chat.', scene: 'start' },
]

/** Short first-run walkthrough. Full-screen, skippable at every step. */
export default function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1

  function finish() {
    markTourSeen()
    onDone()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-md sm:items-center" role="dialog" aria-label="Welcome tour">
      <div className="sheet-in card w-full max-w-md p-6 text-center">
        <div className="mx-auto mb-2 flex h-28 items-center justify-center text-slate-500 dark:text-slate-300">
          {step.scene === 'logo' ? <Logo size={96} /> : <Illustration scene={step.scene} />}
        </div>
        <div className="text-3xl">{step.emoji}</div>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{step.title}</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300">{step.text}</p>

        <div className="mt-5 flex items-center justify-center gap-1.5" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
          {STEPS.map((_, n) => (
            <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-6 bg-accent shadow-[0_0_10px_rgba(182,255,59,0.8)]' : 'w-1.5 bg-slate-300 dark:bg-slate-600'}`} />
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          {!last && <button className="btn-ghost flex-1" onClick={finish}>Skip</button>}
          <button className="btn-primary flex-[2] !min-h-12" onClick={() => (last ? finish() : setI(i + 1))}>
            {last ? <>Let's play <PaddleBall size={20} glow={false} /></> : <>Next <ArrowRight size={18} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}
