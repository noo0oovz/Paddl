import { useRef, useState } from 'react'
import { Download, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import { backupFileName, parseBackup, type Backup } from '../lib/backup'
import { download } from '../lib/exportImage'
import { fmtDate } from '../lib/util'
import { exportAll, hasSafetyCopy, restoreBackup, undoRestore, useData, type RestoreReport } from '../store'
import { Sheet } from './ui'

/** Back up everything to a file, and restore it on this or another device. */
export default function DataSheet({ onClose }: { onClose: () => void }) {
  const { sessions, roster } = useData()
  const input = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<{ backup: Backup; warnings: string[]; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<RestoreReport | null>(null)
  const [saved, setSaved] = useState(false)
  const [reverted, setReverted] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const safety = hasSafetyCopy()

  function save() {
    const blob = new Blob([JSON.stringify(exportAll(), null, 1)], { type: 'application/json' })
    download(blob, backupFileName())
    setSaved(true)
  }

  async function choose(file: File | undefined) {
    setError(null)
    setPicked(null)
    setDone(null)
    if (!file) return
    if (file.size > 25 * 1024 * 1024) return setError('That file is too large to be a Paddl backup.')
    const text = await file.text()
    const r = parseBackup(text)
    if (!r.ok) return setError(r.error)
    setPicked({ backup: r.backup, warnings: r.warnings, name: file.name })
  }

  function restore(mode: 'merge' | 'replace') {
    if (!picked) return
    setDone(restoreBackup(picked.backup, mode))
    setPicked(null)
    setConfirmReplace(false)
  }

  const games = picked ? picked.backup.sessions.reduce((n, s) => n + s.matches.length, 0) : 0

  return (
    <Sheet title="Backup and restore" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Paddl keeps everything on this device. Save a backup file so a cleared browser or a new phone does not lose your sessions and regulars.
        </p>

        <section className="card p-4">
          <div className="flex items-center gap-2 font-bold"><Download size={18} className="text-brand" /> Save a backup</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} and {roster.length} saved {roster.length === 1 ? 'player' : 'players'}.</p>
          <button className="btn-primary mt-3 w-full" onClick={save} disabled={!sessions.length && !roster.length}><Download size={18} /> Download backup file</button>
          {saved && <p className="mt-2 text-sm font-semibold text-brand" role="status">Saved. Keep the file somewhere safe, such as your email or cloud drive.</p>}
        </section>

        <section className="card p-4">
          <div className="flex items-center gap-2 font-bold"><Upload size={18} className="text-brand" /> Restore from a backup</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a Paddl backup file. You will see what is inside before anything changes.</p>
          <input ref={input} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = '' }} aria-label="Backup file" />
          <button className="btn-soft mt-3 w-full" onClick={() => input.current?.click()}><Upload size={18} /> Choose backup file</button>

          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">{error}</p>}

          {picked && (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
              <div className="text-sm font-bold">{picked.name}</div>
              <ul className="text-sm text-slate-600 dark:text-slate-300">
                <li>🗓 Saved {fmtDate(picked.backup.exportedAt)}</li>
                <li>📋 {picked.backup.sessions.length} {picked.backup.sessions.length === 1 ? 'session' : 'sessions'}, {games} games</li>
                <li>👥 {picked.backup.roster.length} saved players</li>
              </ul>
              {picked.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                  <div className="font-bold">Some items could not be read and will be left out:</div>
                  <ul className="mt-1 list-disc pl-4">{picked.warnings.slice(0, 4).map((w) => <li key={w}>{w}</li>)}</ul>
                  {picked.warnings.length > 4 && <div className="mt-1">…and {picked.warnings.length - 4} more.</div>}
                </div>
              )}
              <button className="btn-primary w-full" onClick={() => restore('merge')}>
                <ShieldCheck size={18} /> Add to what is on this device
              </button>
              <p className="-mt-1 text-xs text-slate-500 dark:text-slate-400">Safest. Keeps everything you have and adds or updates sessions from the file.</p>
              {!confirmReplace ? (
                <button className="btn-ghost w-full text-red-600" onClick={() => setConfirmReplace(true)}>Replace everything with this backup…</button>
              ) : (
                <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
                  <p className="text-sm font-semibold text-red-900 dark:text-red-200">Replace everything on this device?</p>
                  <p className="mt-1 text-xs text-red-800 dark:text-red-300">Sessions not in the file are removed. A safety copy of what is here now is kept so you can undo this.</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button className="btn-soft" onClick={() => setConfirmReplace(false)}>Keep mine</button>
                    <button className="btn-danger" onClick={() => restore('replace')}>Yes, replace</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {done && (
            <p className="mt-3 rounded-xl bg-accent/15 px-3 py-2 text-sm font-semibold text-brand" role="status">
              {done.mode === 'replace'
                ? `Done. This device now has the ${done.sessions} sessions from the backup.`
                : `Done. ${done.added} added, ${done.updated} updated, ${done.kept} already up to date.`}
            </p>
          )}
        </section>

        {(done || safety) && !reverted && (
          <section className="text-sm text-slate-500 dark:text-slate-400">
            <button
              className="btn-ghost w-full"
              onClick={() => { if (undoRestore()) { setReverted(true); setDone(null) } }}
            >
              <RotateCcw size={16} /> Undo the last restore{safety ? ` (from ${fmtDate(safety)})` : ''}
            </button>
          </section>
        )}
        {reverted && <p className="text-sm font-semibold text-brand" role="status">Put back exactly as it was before the restore.</p>}
      </div>
    </Sheet>
  )
}
