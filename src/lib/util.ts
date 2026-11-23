import { useEffect, useState } from 'react'

export function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${Math.max(m, 1)} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

export function fmtDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function elapsed(since: number, now: number): string {
  const m = Math.max(0, Math.floor((now - since) / 60000))
  return m < 1 ? 'just started' : `${m} min`
}

export const join = (names: string[]) => names.join(' & ')

/** Re-render on an interval (used for live elapsed timers). */
export function useNow(ms = 30000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/** Keep the screen awake while a session is on screen (courtside use). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = () => {
      navigator.wakeLock.request('screen').then((l) => { if (cancelled) l.release(); else lock = l }).catch(() => {})
    }
    request()
    const onVis = () => document.visibilityState === 'visible' && request()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      lock?.release().catch(() => {})
    }
  }, [active])
}
