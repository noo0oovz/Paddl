import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Press-and-hold: something only happens if a finger (or a key) stays down for `ms`. Used to unlock the Board and to record
 * a win on it, so a stray touch (a child, a bag, a sleeve) can never count a game.
 */

/** The timing of one hold, as plain numbers so it can be tested without a browser. */
export interface HoldClock { start: number; last: number }
export interface HoldResult { status: 'holding' | 'done' | 'stalled'; progress: number }

/**
 * Where a hold has got to at time `now`. `stalled` means the page stopped drawing for a while (the tab was hidden, the
 * device slept): the finger may have lifted unseen in the meantime, so the hold is abandoned instead of finishing on its own.
 */
export function holdStep(c: HoldClock, now: number, total: number, maxGap = 750): HoldResult {
  if (now - c.last > maxGap) return { status: 'stalled', progress: 0 }
  const progress = Math.min(1, Math.max(0, (now - c.start) / total))
  return { status: progress >= 1 ? 'done' : 'holding', progress }
}

export function useHold(ms: number, onDone: () => void) {
  const [progress, setProgress] = useState(0)
  const raf = useRef<number | null>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const msRef = useRef(ms)
  msRef.current = ms

  /** Abandon the hold. Returns whether one was in progress (so a quick tap can tell "released early" from "nothing was held"). */
  const stop = useCallback((): boolean => {
    const was = raf.current !== null
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
    setProgress(0)
    return was
  }, [])

  const start = useCallback(() => {
    if (raf.current !== null) return // already holding
    const t0 = performance.now()
    const clock: HoldClock = { start: t0, last: t0 }
    const tick = () => {
      const now = performance.now()
      const r = holdStep(clock, now, msRef.current)
      clock.last = now
      if (r.status === 'stalled') { raf.current = null; setProgress(0); return }
      if (r.status === 'done') { raf.current = null; setProgress(0); doneRef.current(); return }
      setProgress(r.progress)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    // leaving the page mid-hold ends it: the release would never be seen
    const hidden = () => { if (document.visibilityState === 'hidden') stop() }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      document.removeEventListener('visibilitychange', hidden)
      if (raf.current !== null) cancelAnimationFrame(raf.current)
      raf.current = null
    }
  }, [stop])

  return { progress, holding: progress > 0, start, stop }
}
