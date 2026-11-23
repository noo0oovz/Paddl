import { useSyncExternalStore } from 'react'

/** Subtle audio cues, with a one-tap mute. Off by default so it never surprises neighbouring courts. */
const KEY = 'paddl:sound'
const subs = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

let enabled = read()
let ctx: AudioContext | null = null

export function soundOn(): boolean {
  return enabled
}

export function setSound(on: boolean) {
  enabled = on
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  // Browsers only allow audio after a tap, so switching sound on is the moment to unlock it.
  if (on) {
    audio()
    chime('on')
  }
  subs.forEach((f) => f())
}

export function useSound(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => enabled,
  )
}

function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

type Cue = 'on' | 'match' | 'timer'

const NOTES: Record<Cue, number[]> = {
  on: [660, 880],
  match: [523, 659, 784], // a soft rising arpeggio: "a new match is locked in"
  timer: [880, 880], // two short pings: "this court has hit the time mark"
}

/** Play a short, quiet chime. Does nothing when sound is off. */
export function chime(cue: Cue) {
  if (!enabled) return
  const c = audio()
  if (!c) return
  const t0 = c.currentTime + 0.02
  NOTES[cue].forEach((freq, i) => {
    const o = c.createOscillator()
    const g = c.createGain()
    const start = t0 + i * 0.13
    o.type = 'sine'
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(0.07, start + 0.02) // quiet: peak gain 0.07
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
    o.connect(g).connect(c.destination)
    o.start(start)
    o.stop(start + 0.3)
  })
}

/** Minutes after which a court shows the "time mark" cue. */
export const TIME_MARK_MIN = 15
