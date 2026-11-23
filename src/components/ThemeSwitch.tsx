import { Monitor, Moon, Sun } from 'lucide-react'
import { setTheme, useTheme, type ThemePref } from '../lib/theme'

const OPTIONS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'system', label: 'Auto', icon: Monitor },
  { id: 'dark', label: 'Dark', icon: Moon },
]

/** Three-way Light / Auto / Dark switch. `compact` shows icons only. */
export default function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const pref = useTheme()
  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex rounded-xl border border-slate-200 bg-slate-200/60 p-1 dark:border-white/10 dark:bg-white/5">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={pref === o.id}
          aria-label={`${o.label} theme`}
          title={`${o.label} theme`}
          onClick={() => setTheme(o.id)}
          className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${
            pref === o.id ? 'bg-white text-green-700 shadow-sm dark:bg-accent dark:text-accent-ink' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          <o.icon size={16} />
          {!compact && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  )
}
