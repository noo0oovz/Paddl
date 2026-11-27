import { useEffect, useRef, useState } from 'react'

/**
 * Which of these people have JUST moved into the on-deck match? Used to make their name glow once in the waiting line, so
 * someone looking up from their phone sees the line move. Never fires for what is already there when the screen opens, and
 * clears itself after the glow.
 */
export function useNewlyOnDeck(onDeck: string[], ms = 1800): Set<string> {
  const key = [...onDeck].sort().join(',')
  const previous = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  useEffect(() => {
    const now = new Set(onDeck)
    const before = previous.current
    previous.current = now
    if (!before) return // first render: everything is "new", which is not news
    const added = [...now].filter((id) => !before.has(id))
    if (!added.length) return
    setFresh(new Set(added))
    const t = setTimeout(() => setFresh(new Set()), ms)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return fresh
}
