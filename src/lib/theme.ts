import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'paddl:theme'
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
const subs = new Set<() => void>()

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* storage unavailable */
  }
  return 'dark' // night mode unless the user picks otherwise
}

let pref: ThemePref = read()

export function isDark(p: ThemePref = pref): boolean {
  return p === 'dark' || (p === 'system' && !!media?.matches)
}

/** Apply the theme to <html> and the browser chrome colour. */
export function applyTheme() {
  const dark = isDark()
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#05070d' : '#eef2fa')
}

export function setTheme(p: ThemePref) {
  pref = p
  try {
    localStorage.setItem(KEY, p)
  } catch {
    /* ignore */
  }
  applyTheme()
  subs.forEach((f) => f())
}

// Follow the OS while on "System".
media?.addEventListener?.('change', () => {
  if (pref === 'system') {
    applyTheme()
    subs.forEach((f) => f())
  }
})

export function useTheme(): ThemePref {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => pref,
  )
}
