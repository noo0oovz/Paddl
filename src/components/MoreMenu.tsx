import { useEffect, useRef, useState } from 'react'
import { HardDriveDownload, HelpCircle, Home, MoreHorizontal, Smartphone } from 'lucide-react'
import ThemeSwitch from './ThemeSwitch'

/** Phone header "more" menu: keeps the title readable by tucking theme, help and all-sessions away. */
export default function MoreMenu({ onHelp, onHome, onData, onInstall }: { onHelp: () => void; onHome: () => void; onData: () => void; onInstall: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('touchstart', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('touchstart', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button className="btn-soft !min-h-9 !px-2.5" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="More options" title="More"><MoreHorizontal size={18} /></button>
      {open && (
        <div className="paddl-in absolute right-0 z-30 mt-2 w-64 space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-slate-900">
          <div className="label !mb-1">Theme</div>
          <ThemeSwitch fill />
          <button className="btn-ghost w-full justify-start" onClick={() => { setOpen(false); onHelp() }}><HelpCircle size={18} /> How to use</button>
          <button className="btn-ghost w-full justify-start" onClick={() => { setOpen(false); onInstall() }}><Smartphone size={18} /> Add to home screen</button>
          <button className="btn-ghost w-full justify-start" onClick={() => { setOpen(false); onData() }}><HardDriveDownload size={18} /> Backup and restore</button>
          <button className="btn-ghost w-full justify-start" onClick={() => { setOpen(false); onHome() }}><Home size={18} /> All sessions</button>
        </div>
      )}
    </div>
  )
}
