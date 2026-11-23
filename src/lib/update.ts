import { useSyncExternalStore } from 'react'

/** A new version of the app has been downloaded and is waiting. The host chooses when to switch, never mid-game. */
let waiting: ServiceWorker | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => waiting !== null,
  )
}

/** Switch to the new version now (reloads the page once it takes over). Data is already saved on the device. */
export function applyUpdate() {
  if (!waiting) return
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  waiting.postMessage('skip-waiting')
}

export function watchForUpdates(reg: ServiceWorkerRegistration) {
  const track = (w: ServiceWorker | null) => {
    if (!w) return
    const check = () => {
      // A worker in "installed" state while another one controls the page means an update is waiting.
      if (w.state === 'installed' && navigator.serviceWorker.controller) {
        waiting = w
        emit()
      }
    }
    check()
    w.addEventListener('statechange', check)
  }
  track(reg.waiting)
  reg.addEventListener('updatefound', () => track(reg.installing))
  // Look for a new version when the app comes back to the foreground, and every 30 minutes while open.
  const poll = () => void reg.update().catch(() => {})
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && poll())
  setInterval(poll, 30 * 60 * 1000)
}
