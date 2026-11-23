import { useCallback, useEffect, useRef, useState } from 'react'
import { initVoices, speak, speechSupported, stopSpeaking } from './announce'

/**
 * Call-out state shared by the Courts screen and the Board.
 *  - "speaking" ends when the speech engine says it has finished, not on a guess.
 *  - Each announcement is tied to a "context" (the game it was about). If that changes (a new game starts on the
 *    court, a result is recorded) the speech is cut off, so the old players are never called after their game ended.
 *  - Leaving the screen silences it.
 */
export function useAnnouncer(contexts: Record<string, string>) {
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const active = useRef<{ id: string; context: string } | null>(null)

  useEffect(() => {
    initVoices()
    return () => {
      active.current = null
      stopSpeaking()
    }
  }, [])

  // If what was being announced is no longer what is on screen, stop.
  useEffect(() => {
    const a = active.current
    if (a && contexts[a.id] !== a.context) {
      active.current = null
      stopSpeaking()
      setSpeakingId(null)
    }
  })

  const stop = useCallback(() => {
    active.current = null
    stopSpeaking()
    setSpeakingId(null)
  }, [])

  /** Start announcing, or stop if this same button is already speaking. Returns false if the device cannot speak. */
  const announce = useCallback(
    (id: string, text: string): boolean => {
      if (!speechSupported()) return false
      if (active.current?.id === id) {
        stop()
        return true
      }
      const ok = speak(text, () => {
        if (active.current?.id === id) {
          active.current = null
          setSpeakingId(null)
        }
      })
      if (!ok) return false
      active.current = { id, context: contexts[id] ?? '' }
      setSpeakingId(id)
      return true
    },
    [contexts, stop],
  )

  return { speakingId, announce, stop }
}
