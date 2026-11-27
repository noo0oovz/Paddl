import { useEffect, useRef } from 'react'

/**
 * Every open dialog (a sheet, the Board, the first-run tour) registers here, so that:
 *  - Escape closes only the TOPMOST one. Each used to listen on the window by itself, so one Escape closed a confirm AND the
 *    sheet under it, or the voice sheet AND the whole Board;
 *  - keyboard focus moves into the dialog when it opens, stays inside while Tab is pressed, and goes back to whatever opened
 *    it when it closes (it used to stay on the page behind, so a keyboard user tabbed through the whole page first, and lost
 *    their place on close).
 */
const stack: symbol[] = []

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useDialog(root: React.RefObject<HTMLElement | null>, onClose: () => void, opts: { escape?: boolean } = {}) {
  const { escape = true } = opts
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const id = Symbol('dialog')
    stack.push(id)
    const opener = document.activeElement as HTMLElement | null
    const el = root.current

    // move focus in: the first control, or the dialog itself so a screen reader announces it
    const first = el?.querySelector<HTMLElement>(FOCUSABLE)
    if (el) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      ;(first ?? el).focus({ preventScroll: true })
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return // not the top layer
      if (e.key === 'Escape' && escape) { e.preventDefault(); closeRef.current(); return }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement)
        if (!items.length) { e.preventDefault(); el.focus(); return }
        const a = items[0], z = items[items.length - 1]
        const cur = document.activeElement as HTMLElement | null
        if (e.shiftKey && (cur === a || cur === el || !el.contains(cur))) { e.preventDefault(); z.focus() }
        else if (!e.shiftKey && (cur === z || !el.contains(cur))) { e.preventDefault(); a.focus() }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      const at = stack.indexOf(id)
      if (at >= 0) stack.splice(at, 1)
      // give focus back to what opened this dialog, if it is still on the page
      if (opener && document.contains(opener) && typeof opener.focus === 'function') opener.focus({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** For tests: how many dialogs are open. */
export const openDialogs = () => stack.length
