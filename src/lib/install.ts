import { useSyncExternalStore } from 'react'

export type Platform = 'ios' | 'ipad' | 'android' | 'desktop'
export type Browser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'other'

export interface Env {
  platform: Platform
  browser: Browser
  /** Opened from the home screen already (so there is nothing to install). */
  installed: boolean
  /** iOS only: a browser that cannot add to the home screen (Chrome, Firefox, an in-app browser). */
  needsSafari: boolean
}

interface Sniff {
  ua: string
  maxTouchPoints?: number
  platform?: string
  standalone?: boolean // navigator.standalone (iOS)
  displayStandalone?: boolean // matchMedia('(display-mode: standalone)')
}

/**
 * Work out the device and browser so the instructions match what the person is actually holding.
 * Pure (takes the values as input) so every combination can be tested.
 * iPadOS 13+ reports itself as a Mac, so an "iPad" is a Mac with a touch screen.
 */
export function detect(n: Sniff): Env {
  const ua = n.ua || ''
  const iPhone = /iPhone|iPod/.test(ua)
  const iPadClassic = /iPad/.test(ua)
  const iPadAsMac = /Macintosh/.test(ua) && (n.maxTouchPoints ?? 0) > 1
  const android = /Android/i.test(ua)
  const platform: Platform = iPhone ? 'ios' : iPadClassic || iPadAsMac ? 'ipad' : android ? 'android' : 'desktop'

  const edge = /EdgiOS|EdgA|Edg\//.test(ua)
  const chrome = /CriOS|Chrome\//.test(ua) && !edge && !/SamsungBrowser/.test(ua)
  const firefox = /FxiOS|Firefox\//.test(ua)
  const samsung = /SamsungBrowser/.test(ua)
  // Safari has "Safari/" but none of the others' tokens. In-app browsers (Facebook, Instagram, Line...) do not offer Add to Home Screen.
  const inApp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Messenger|Snapchat|TikTok|; wv\)/i.test(ua)
  const safari = /Safari\//.test(ua) && !chrome && !firefox && !edge && !samsung && !inApp
  const browser: Browser = edge ? 'edge' : samsung ? 'samsung' : firefox ? 'firefox' : chrome ? 'chrome' : safari ? 'safari' : 'other'

  const isApple = platform === 'ios' || platform === 'ipad'
  return {
    platform,
    browser,
    installed: !!n.standalone || !!n.displayStandalone,
    needsSafari: isApple && browser !== 'safari',
  }
}

/** The install event Chrome and Edge on Android (and desktop) fire when the app can be installed with one tap. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallEvent | null = null
let installedNow = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** Call once at startup so the one-tap prompt is captured whenever the browser offers it. */
export function watchInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep it for our own button instead of the browser's mini-bar
    deferred = e as InstallEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installedNow = true
    emit()
  })
}

export function useCanInstallOneTap(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => deferred !== null,
  )
}

export function wasInstalledThisSession(): boolean {
  return installedNow
}

/** Show the browser's own install dialog. Returns true if the person accepted. */
export async function installOneTap(): Promise<boolean> {
  if (!deferred) return false
  const ev = deferred
  deferred = null
  emit()
  try {
    await ev.prompt()
    const { outcome } = await ev.userChoice
    return outcome === 'accepted'
  } catch {
    return false
  }
}

/** Read the live browser. */
export function currentEnv(): Env {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { standalone?: boolean }) : undefined
  return detect({
    ua: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints,
    platform: nav?.platform,
    standalone: nav?.standalone,
    displayStandalone: typeof window !== 'undefined' && !!window.matchMedia?.('(display-mode: standalone)').matches,
  })
}
