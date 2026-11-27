import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Sheet } from './ui'

/** One collapsible topic. */
function Topic({ emoji, title, children, open: initial = false }: { emoji: string; title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/50 dark:border-white/10 dark:bg-white/[0.03]">
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="text-xl">{emoji}</span>
        <span className="flex-1 font-bold">{title}</span>
        <ChevronDown size={18} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>}
    </div>
  )
}

const li = 'flex gap-2'

/** How-to guide. Plain language, one topic per thing a host will wonder about. */
export default function Help({ onClose, onTour, onInstall }: { onClose: () => void; onTour?: () => void; onInstall?: () => void }) {
  return (
    <Sheet title="How to use Paddl" onClose={onClose}>
      <div className="space-y-2.5">
        {onTour && (
          <button className="btn-soft w-full" onClick={() => { onClose(); onTour() }}>▶️ Watch the 30-second tour again</button>
        )}

        <Topic emoji="🚀" title="Quick start" open>
          <ol className="space-y-1.5">
            <li className={li}><b>1.</b> Tap <b>New session</b>, type or paste your players (one per line), and pick how many courts you have.</li>
            <li className={li}><b>2.</b> Tap <b>Start session</b>. Paddl puts the first players on the courts and lines up the next match.</li>
            <li className={li}><b>3.</b> When a game ends, tap the <b>“… won”</b> button for the winning team. The next game starts on its own.</li>
            <li className={li}><b>4.</b> At the end tap <b>End</b>. You get final standings, games played, match history and images to share.</li>
          </ol>
        </Topic>

        <Topic emoji="🎛️" title="Pick a mode">
          <p><b>Fair rotation</b> (recommended): whoever has played the fewest games goes next, and partners keep changing.</p>
          <p><b>Winners stay</b>: the winning team holds the court for a few games, then everyone rotates.</p>
          <p><b>Skill balanced</b>: uses player levels to make even teams.</p>
          <p><b>Round robin</b>: everyone partners and faces everyone as evenly as possible.</p>
          <p><b>Mystery mix</b>: surprise teams every game, great for social nights.</p>
          <p><b>Challenger court</b>: in More rules, make Court 1 a winners-stay court and keep the others rotating.</p>
        </Topic>

        <Topic emoji="📺" title="The Board (for a tablet or TV)">
          <p>Tap <b>Board</b> to show a big, easy-to-read view with every court and who is <b>on deck</b>. Prop up a tablet by the courts so players can see their turn.</p>
          <p>You can run the whole night from the Board: <b>press and hold the winning team for about a second and a half</b> and the next match goes on. A quick touch only shows a reminder, so nobody can count a game by brushing the screen. Held the wrong team? Tap <b>Undo</b> in the pop-up.</p>
        </Topic>

        <Topic emoji="🔁" title="Swap, remix and fix the queue">
          <p>In the <b>Next match</b> box, the swap icon beside a name sends that player to the back and brings the next person in.</p>
          <p>Nobody extra waiting? Then there is no one to swap in yet: tap a name to make someone play next, or pull a player in.</p>
          <p>To add or remove a court, use <b>Add court</b> under the courts, or tap a court's settings icon to remove it.</p>
          <p><b>Redraw next</b> picks different partners and opponents for the next match from the people already waiting. If everyone waiting has to play, nothing can change.</p>
          <p><b>Reshuffle</b> (on a court) sends the four on that court back to the line and picks a different four. This is the one that really mixes people up, so use it if matches feel repetitive.</p>
          <p>Tap a name in the <b>Waiting line</b> to make them play next, send them to the back, or pull them into a game right now.</p>
        </Topic>

        <Topic emoji="☕" title="Breaks, late arrivals and leaving">
          <p>Tap a player and choose <b>Take a break</b>. They keep their place in line. Tap <b>Back</b> when they return.</p>
          <p>Late arrivals: open <b>Players</b> and add them. They join at the average games played so they do not hog the courts.</p>
          <p><b>Left</b> removes someone for the rest of the night, but their results stay.</p>
        </Topic>

        <Topic emoji="↩️" title="Undo and fixing mistakes">
          <p><b>Undo</b> (top of every screen) reverses your last action and still works after a refresh.</p>
          <p>Wrong winner or score? Open <b>History</b>, tap the game, and fix it. A game that never happened can be deleted there.</p>
          <p>Ended the session by mistake? Open the results and tap <b>Reopen</b>.</p>
        </Topic>

        <Topic emoji="🏆" title="Results and sharing">
          <p>After <b>End</b>, <b>Save images</b> makes four pictures: final standings, games played with minutes, match history, and an awards card with the podium for the group chat.</p>
        </Topic>

        <Topic emoji="📲" title="Add Paddl to your home screen">
          <p>Open Paddl in one tap, full screen, like an app. It works for iPhone, iPad, Android phones and Android tablets.</p>
          {onInstall && <button className="btn-primary mt-1 w-full" onClick={() => { onClose(); onInstall() }}>Show me how</button>}
        </Topic>

        <Topic emoji="📱" title="Works offline, saves automatically">
          <p>Everything saves on this device after every tap, so a refresh or no signal will not lose your night. Add Paddl to your home screen for a full-screen app.</p>
        </Topic>
      </div>
    </Sheet>
  )
}
