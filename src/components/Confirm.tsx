import { useCallback, useState, type ReactNode } from 'react'
import { Sheet } from './ui'

interface Ask {
  title: string
  body?: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

/**
 * An in-app confirmation sheet that matches the theme (the browser's own popups look out of place).
 *   const { ask, dialog } = useConfirm()
 *   ask({ title: 'Delete?', confirmLabel: 'Delete', danger: true, onConfirm: () => ... })
 *   return <>... {dialog}</>
 */
export function useConfirm() {
  const [req, setReq] = useState<Ask | null>(null)
  const ask = useCallback((a: Ask) => setReq(a), [])
  const dialog = req ? (
    <Sheet title={req.title} onClose={() => setReq(null)}>
      <div className="space-y-4">
        {req.body && <div className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{req.body}</div>}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-soft !min-h-12" onClick={() => setReq(null)}>Cancel</button>
          <button
            className={`${req.danger ? 'btn-danger' : 'btn-primary'} !min-h-12`}
            onClick={() => {
              const go = req.onConfirm
              setReq(null)
              go()
            }}
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  ) : null
  return { ask, dialog }
}
