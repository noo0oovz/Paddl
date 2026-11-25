import { AlertTriangle, Download } from 'lucide-react'
import { exportAll, useData } from '../store'
import { download } from '../lib/exportImage'
import { backupFileName } from '../lib/backup'

/**
 * Shown on every screen when the device refuses to save (storage full, or blocked in a private window).
 * Without this a host could play a whole night believing it was safe. It offers a file copy of everything.
 */
export default function SaveWarning() {
  const { saved } = useData()
  if (saved === 'ok') return null
  function save() {
    const blob = new Blob([JSON.stringify(exportAll(), null, 1)], { type: 'application/json' })
    download(blob, backupFileName())
  }
  return (
    <div role="alert" className="fixed inset-x-3 bottom-20 z-[85] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-red-500/50 bg-red-950/95 px-4 py-3 text-white shadow-2xl backdrop-blur-xl md:bottom-4">
      <AlertTriangle size={20} className="shrink-0 text-red-300" />
      <span className="min-w-0 flex-1 text-sm font-semibold">This device could not save your session. Keep this page open, and save a copy now.</span>
      <button className="btn-soft !min-h-9 shrink-0 !px-3 !text-slate-900 !bg-white" onClick={save}><Download size={16} /> Save copy</button>
    </div>
  )
}
