import { RefreshCw } from 'lucide-react'
import { applyUpdate, useUpdateReady } from '../lib/update'

/** Shown when a new version is ready. Never reloads by itself, so a game in progress is not interrupted. */
export default function UpdateBanner() {
  const ready = useUpdateReady()
  if (!ready) return null
  return (
    <div role="status" className="paddl-in fixed inset-x-3 top-3 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-accent/40 bg-slate-900/95 px-4 py-3 text-white shadow-[0_0_40px_-10px_rgba(182,255,59,0.6)] backdrop-blur-xl">
      <RefreshCw size={18} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 text-sm font-semibold">A new version of Paddl is ready. Your session is saved.</span>
      <button className="btn-primary !min-h-9 shrink-0 !px-3" onClick={applyUpdate}>Update</button>
    </div>
  )
}
