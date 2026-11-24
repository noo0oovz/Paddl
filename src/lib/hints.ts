const KEY = 'paddl:hints'

/** First-time tips are shown until the host has used the app once; after that they live in Help. */
export function hintsSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done'
  } catch {
    return true // if storage is unavailable, never nag
  }
}

export function markHintsSeen() {
  try {
    localStorage.setItem(KEY, 'done')
  } catch {
    /* ignore */
  }
}
