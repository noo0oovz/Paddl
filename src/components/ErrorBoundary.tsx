import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Download, Home as HomeIcon, RefreshCw } from 'lucide-react'
import { exportAll, openSession } from '../store'
import { download } from '../lib/exportImage'
import { backupFileName } from '../lib/backup'

/**
 * Last line of defence. If any screen throws while drawing (a damaged saved session, a bug nobody found yet), the whole
 * page used to go blank, and because the open session is remembered, it stayed blank on every reload: the only way out
 * was clearing the browser's site data, which loses every session. Now the host sees what happened, can save a copy of
 * everything first, and can leave the broken screen, which also forgets the "open session" so a reload comes back to Home.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; saved: boolean }> {
  state = { error: null as Error | null, saved: false }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Paddl screen crashed:', error, info.componentStack)
  }

  private saveCopy = () => {
    try {
      const blob = new Blob([JSON.stringify(exportAll(), null, 1)], { type: 'application/json' })
      download(blob, backupFileName())
      this.setState({ saved: true })
    } catch {
      /* nothing more can be done here */
    }
  }

  private home = () => {
    try { openSession(null) } catch { /* ignore */ }
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-10 text-center">
        <AlertTriangle size={40} className="mx-auto text-amber-400" />
        <h1 className="text-2xl font-black tracking-tight">Something went wrong on this screen</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Your sessions are still saved on this device. Save a copy to be safe, then go back to the home screen.
        </p>
        <button className="btn-soft !min-h-12" onClick={this.saveCopy}><Download size={18} /> {this.state.saved ? 'Copy saved. Save another' : 'Save a copy of everything'}</button>
        <button className="btn-primary !min-h-12" onClick={this.home}><HomeIcon size={18} /> Go to the home screen</button>
        <button className="btn-ghost" onClick={() => location.reload()}><RefreshCw size={16} /> Reload the app</button>
        <p className="text-xs text-slate-500 dark:text-slate-400">If this keeps happening, restore the copy you saved from Backup and restore.</p>
      </div>
    )
  }
}
