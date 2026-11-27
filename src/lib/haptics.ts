import { useSyncExternalStore } from 'react'

/**
 * A short buzz in the hand when a result is recorded, so the host can confirm a tap without looking at the screen.
 *
 * - It only fires when something was actually recorded (never for an ignored tap), so "I felt it" always means "it went in".
 * - It works where the browser has the Vibration API (Android Chrome and most Android browsers). iPhones do not have it,
 *   so there the setting is hidden and every call does nothing.
 * - On by default where it is supported (unlike the chimes, it cannot disturb the next court), with a one-tap switch.
 */
const KEY = 'paddl:haptics'
const subs = new Set<() => void>()

/** Short and firm: long enough to feel through a case, short enough not to be annoying over a whole night. */
export const PULSE = { win: [22], undo: [14, 70, 14] } as const
export type Pulse = keyof typeof PULSE

/** Does this device have a vibration motor the browser lets us use? */
export function hapticsSupported(): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  } catch {
    return false
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

let enabled = read()

export function hapticsOn(): boolean {
  return enabled
}

export function setHaptics(on: boolean) {
  enabled = on
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* the choice just will not survive a reload */
  }
  subs.forEach((f) => f())
  if (on) buzz('win') // let the host feel what it will be like
}

export function useHaptics(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => enabled,
  )
}

/** Vibrate once. Does nothing when the setting is off, the device cannot, or the browser refuses (it needs a recent tap). */
export function buzz(kind: Pulse) {
  if (!enabled || !hapticsSupported()) return
  try {
    navigator.vibrate([...PULSE[kind]])
  } catch {
    /* some browsers throw when the page has not been tapped yet: nothing to do */
  }
}

/** For tests: re-read the saved choice. */
export function _reloadHapticsSetting() {
  enabled = read()
}
