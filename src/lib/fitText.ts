import { useLayoutEffect, useRef, useState } from 'react'

/**
 * The biggest font size (px) at which text of a given natural width still fits a box.
 * `naturalWidth` is how wide the text is when drawn at `probeSize`. Text width grows in step with the font size,
 * so the answer is a simple proportion, then clamped to the allowed range. Pure, so it is easy to test.
 */
export function fitSize(naturalWidth: number, probeSize: number, boxWidth: number, min: number, max: number): number {
  if (!(boxWidth > 0) || !(naturalWidth > 0) || !(probeSize > 0)) return min
  const size = (boxWidth / naturalWidth) * probeSize
  return Math.max(min, Math.min(max, Math.floor(size * 10) / 10))
}

const PROBE = 100 // measure each name at 100px, then scale

/**
 * One font size for a group of names that each have to fit a box, so the names on a court look the same size.
 *
 * It measures the REAL boxes (every element marked `data-fit-box` inside `ref`) and the real text, in the font and
 * letter-spacing the names are drawn with, so no padding has to be guessed. A long name shrinks, a short one is
 * capped at `max`, and it measures again when the boxes change size (turning the tablet, adding a court) or the
 * names change.
 *
 * Usage: const { ref, size } = useFitText(names, { min: 13, max: 60 })
 *        <div ref={ref}> ...each name's wrapper has data-fit-box and its text has data-fit-text... </div>
 */
export function useFitText(names: string[], opts: { min?: number; max?: number; maxHeight?: number; weight?: number } = {}) {
  const { min = 12, max = 64, maxHeight, weight = 900 } = opts
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(max)
  const key = names.join('\u0001')

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const probe = document.createElement('span')
    document.body.appendChild(probe)

    const measure = () => {
      // The narrowest real box decides: every name on a court shares one size.
      const boxes = [...el.querySelectorAll<HTMLElement>('[data-fit-box]')]
      if (!boxes.length) return
      const widths = boxes.map((b) => {
        const cs = getComputedStyle(b)
        return b.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
      })
      const box = Math.min(...widths)
      // measure the text the way it is drawn: same font family and the same letter-spacing, per em
      const sample = el.querySelector<HTMLElement>('[data-fit-text]')
      const scs = sample ? getComputedStyle(sample) : getComputedStyle(el)
      const ls = scs.letterSpacing === 'normal' ? 0 : parseFloat(scs.letterSpacing) / (parseFloat(scs.fontSize) || 16)
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none;left:-9999px;top:0;font-size:${PROBE}px;font-weight:${weight};letter-spacing:${ls * PROBE}px;font-family:${scs.fontFamily}`
      let best = max
      for (const n of names) {
        probe.textContent = n
        best = Math.min(best, fitSize(probe.getBoundingClientRect().width, PROBE, box, min, max))
      }
      // Never taller than the space allows, so a very wide court cannot make names bigger than their box is tall.
      if (maxHeight && maxHeight > 0) best = Math.min(best, Math.max(min, maxHeight))
      setSize((prev) => (Math.abs(prev - best) < 0.25 ? prev : best))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // fonts that load late change the width of the text
    void document.fonts?.ready.then(measure)
    return () => { ro.disconnect(); probe.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, min, max, maxHeight, weight])

  return { ref, size }
}
