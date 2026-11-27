import { useEffect, useState } from 'react'

export function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${Math.max(m, 1)} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

/** "1 game", "2 games". */
export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
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

/**
 * Re-render on an interval (used for live elapsed timers). Every 10 s by default: a refresh of the Courts screen costs about
 * 2 ms even with 80 players, 12 courts and 600 games, so this is cheap, and a minute counter is never more than 10 s late
 * (it used to be up to 30 s).
 */
export function useNow(ms = 10000): number {
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

/**
 * A result tap on a game that started less than this long ago is ignored. When a court's game is recorded, the court is
 * redrawn with the NEXT game right under the finger, so a double tap (or a thumb that lands twice) hit the new game's win
 * button and recorded it as finished after a few milliseconds. A real game is never this short.
 */
export const TAP_ARM_MS = 800
/** The automated browser tests record results within milliseconds of a game starting on purpose; they switch the guard off. */
const armingOff = () => { try { return localStorage.getItem('paddl:test-no-arming') === '1' } catch { return false } }
export const gameIsArmed = (startedAt: number, now = Date.now()) => armingOff() || now - startedAt >= TAP_ARM_MS

/**
 * True for a real Enter press. The Enter that confirms an IME conversion (Japanese, Chinese, Korean, some phone keyboards)
 * also arrives as a keydown with key "Enter"; treating it as "add this name" added half-typed text.
 */
export const isEnter = (e: { key: string; keyCode?: number; nativeEvent?: { isComposing?: boolean } }) =>
  e.key === 'Enter' && !e.nativeEvent?.isComposing && e.keyCode !== 229
