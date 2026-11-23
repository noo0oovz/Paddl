import type { ReactNode } from 'react'

/**
 * Original vector artwork. Everything uses currentColor / CSS colours so it follows the theme, and it is inline
 * SVG, so it is crisp at any size, works offline and adds almost nothing to the download.
 */

/** Glowing pickleball with a court-line ring: the Paddl logo. */
export function Logo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Paddl logo" className="drop-shadow-[0_0_18px_rgba(182,255,59,0.55)]">
      <defs>
        <radialGradient id="pb" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#f3ffc8" />
          <stop offset="0.45" stopColor="#b6ff3b" />
          <stop offset="1" stopColor="#6fb800" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill="none" stroke="#22d3ee" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="3 5" />
      <circle cx="32" cy="32" r="21" fill="url(#pb)" />
      <g fill="#0b1400" fillOpacity="0.78">
        <circle cx="26" cy="25" r="2.3" />
        <circle cx="37" cy="24" r="2.3" />
        <circle cx="32" cy="33" r="2.3" />
        <circle cx="23" cy="36" r="2.3" />
        <circle cx="41" cy="35" r="2.3" />
        <circle cx="32" cy="43" r="2.3" />
      </g>
    </svg>
  )
}

/** Faint half-court line drawing, used as a decorative backdrop. */
export function CourtLines({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 220" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
      <rect x="10" y="10" width="380" height="200" rx="6" />
      <line x1="200" y1="10" x2="200" y2="210" />
      <line x1="10" y1="68" x2="390" y2="68" />
      <line x1="10" y1="152" x2="390" y2="152" />
      <line x1="105" y1="68" x2="105" y2="152" />
      <line x1="295" y1="68" x2="295" y2="152" />
      <line x1="10" y1="110" x2="105" y2="110" />
      <line x1="295" y1="110" x2="390" y2="110" />
    </svg>
  )
}

/** Floating ball with a motion trail. */
function Ball({ x, y, r = 14 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#b6ff3b" />
      <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.55} fill="#f3ffc8" fillOpacity="0.5" />
      <g fill="#0b1400" fillOpacity="0.7">
        <circle cx={x - r * 0.35} cy={y - r * 0.05} r={r * 0.14} />
        <circle cx={x + r * 0.3} cy={y - r * 0.3} r={r * 0.14} />
        <circle cx={x + r * 0.05} cy={y + r * 0.4} r={r * 0.14} />
      </g>
    </g>
  )
}

type Scene = 'start' | 'games' | 'players' | 'free'

/** Small illustration for empty states. */
export function Illustration({ scene, className = '' }: { scene: Scene; className?: string }) {
  return (
    <svg viewBox="0 0 240 130" className={`mx-auto w-48 ${className}`} aria-hidden>
      <g fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5">
        <rect x="14" y="40" width="212" height="76" rx="6" />
        <line x1="120" y1="40" x2="120" y2="116" />
        <line x1="14" y1="78" x2="226" y2="78" strokeDasharray="3 4" />
      </g>
      {scene === 'start' && (
        <>
          <path d="M40 96 C 80 10, 150 10, 196 70" fill="none" stroke="#22d3ee" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="4 6" />
          <Ball x={196} y={70} />
        </>
      )}
      {scene === 'games' && (
        <>
          <g fill="none" stroke="#b6ff3b" strokeWidth="2.5" strokeLinecap="round">
            <path d="M92 70 l8 8 l16 -18" />
          </g>
          <circle cx="104" cy="70" r="26" fill="none" stroke="#b6ff3b" strokeOpacity="0.45" strokeWidth="1.5" />
          <Ball x={170} y={58} r={11} />
        </>
      )}
      {scene === 'players' && (
        <>
          <g fill="#22d3ee" fillOpacity="0.85">
            <circle cx="92" cy="62" r="10" />
            <path d="M74 98 a18 18 0 0 1 36 0 z" />
          </g>
          <g fill="#b6ff3b" fillOpacity="0.9">
            <circle cx="150" cy="62" r="10" />
            <path d="M132 98 a18 18 0 0 1 36 0 z" />
          </g>
          <g stroke="currentColor" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round">
            <path d="M184 40 v16 M176 48 h16" />
          </g>
        </>
      )}
      {scene === 'free' && (
        <>
          <g fill="#b6ff3b" fillOpacity="0.9">
            {[70, 100, 130, 160].map((x) => <circle key={x} cx={x} cy={84} r="8" />)}
          </g>
          <Ball x={120} y={32} r={12} />
        </>
      )}
    </svg>
  )
}

/** A panel with a header strip, used on Home / Board. */
export function Glow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`relative ${className}`}>{children}</div>
}
