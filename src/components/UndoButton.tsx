import { Undo2 } from 'lucide-react'
import { undo, useData } from '../store'

/** Always-visible Undo. Shows how many steps can be undone. */
export default function UndoButton({ full = false }: { full?: boolean }) {
  const { undo: depth } = useData()
  return (
    <button
      className={`btn-soft !min-h-9 !px-3 ${full ? 'w-full justify-start' : ''}`}
      onClick={undo}
      disabled={!depth}
      aria-label={`Undo last action${depth ? ` (${depth} available)` : ''}`}
      title={depth ? `Undo (${depth} step${depth === 1 ? '' : 's'} available)` : 'Nothing to undo'}
    >
      <Undo2 size={16} /> Undo
    </button>
  )
}

/** Small "saved on this device" status, so the host knows nothing is lost. Turns into a warning if storage fails. */
export function SaveStatus({ className = '' }: { className?: string }) {
  const { saved } = useData()
  return saved === 'ok' ? (
    <span className={`text-xs text-slate-400 ${className}`} title="Every change is saved on this device. It works offline.">● Saved on this device</span>
  ) : (
    <span className={`text-xs font-semibold text-red-600 ${className}`} role="alert">⚠ Could not save. Storage is full or blocked</span>
  )
}
