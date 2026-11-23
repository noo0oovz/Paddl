import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Illustration } from './art'

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="sheet-in flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl dark:border-white/10 dark:bg-slate-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost !min-h-9 !px-2" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )
}

export function Segmented<T extends string | number>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string; sub?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-semibold transition ${
            o.value === value
              ? 'border-accent bg-accent text-accent-ink shadow-[0_6px_20px_-8px_rgba(182,255,59,0.7)]'
              : 'border-slate-200 bg-white/60 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
          }`}
        >
          {o.label}
          {o.sub && <span className={`block text-[11px] font-normal ${o.value === value ? 'text-accent-ink/75' : 'text-slate-500'}`}>{o.sub}</span>}
        </button>
      ))}
    </div>
  )
}

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className="btn-soft !px-0 w-11 text-lg" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}>−</button>
      <div className="min-w-10 text-center text-xl font-bold tabular-nums">{value}</div>
      <button type="button" className="btn-soft !px-0 w-11 text-lg" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>+</button>
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (b: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 py-1 text-left">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-accent shadow-[0_0_14px_rgba(182,255,59,0.55)]' : 'bg-slate-300 dark:bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

export function Empty({ title, hint, scene }: { title: string; hint?: string; scene?: 'start' | 'games' | 'players' | 'free' }) {
  return (
    <div className="card p-8 text-center">
      {scene && <div className="mb-2 text-slate-500 dark:text-slate-300"><Illustration scene={scene} /></div>}
      <div className="font-bold">{title}</div>
      {hint && <div className="mx-auto mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  )
}
