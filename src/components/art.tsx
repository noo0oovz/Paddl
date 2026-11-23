import type { ReactNode } from 'react'

/**
 * Original vector artwork. Everything uses currentColor / CSS colours so it follows the theme, and it is inline
 * SVG, so it is crisp at any size, works offline and adds almost nothing to the download.
 */

/**
 * A pickleball paddle with the ball: the Paddl mark. The paddle is the modern shape (a tall, rounded rectangle face
 * with a short handle and a pommel); the ball is perforated. Drawn as one tilted group so it works at any size.
 */
export function PaddleBall({ size = 64, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Pickleball paddle and ball"
      className={glow ? 'drop-shadow-[0_0_14px_rgba(182,255,59,0.5)]' : undefined}
    >
      <defs>
        <linearGradient id="pd-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0b7a96" />
        </linearGradient>
        <radialGradient id="pd-ball" cx="36%" cy="30%" r="80%">
          <stop offset="0" stopColor="#f3ffc8" />
          <stop offset="0.5" stopColor="#b6ff3b" />
          <stop offset="1" stopColor="#6fb800" />
        </radialGradient>
      </defs>
      {/* paddle, tilted */}
      <g transform="translate(6 3) rotate(32 26 30) scale(0.92)">
        <rect x="14" y="3" width="24" height="31" rx="10" fill="url(#pd-face)" />
        <rect x="14" y="3" width="24" height="31" rx="10" fill="none" stroke="#0a2e3a" strokeOpacity="0.55" strokeWidth="2.2" />
        <rect x="17.5" y="6.5" width="17" height="24" rx="7" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1" />
        <path d="M22 9 q4 -2 8 0" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="23" y="33" width="6" height="6" fill="#0a2e3a" />
        <rect x="22" y="38" width="8" height="17" rx="3" fill="#13202e" />
        <rect x="22" y="38" width="8" height="17" rx="3" fill="none" stroke="#b6ff3b" strokeOpacity="0.55" strokeWidth="1" />
        <g stroke="#b6ff3b" strokeOpacity="0.5" strokeWidth="1">
          <line x1="22.5" y1="43" x2="29.5" y2="43" />
          <line x1="22.5" y1="47" x2="29.5" y2="47" />
          <line x1="22.5" y1="51" x2="29.5" y2="51" />
        </g>
        <rect x="21" y="54" width="10" height="3.5" rx="1.6" fill="#b6ff3b" />
      </g>
      {/* ball */}
      <circle cx="48" cy="46" r="11.5" fill="url(#pd-ball)" />
      <circle cx="48" cy="46" r="11.5" fill="none" stroke="#0b1400" strokeOpacity="0.35" strokeWidth="1" />
      <g fill="#0b1400" fillOpacity="0.72">
        <circle cx="43.8" cy="41.5" r="1.6" />
        <circle cx="50.2" cy="41" r="1.6" />
        <circle cx="47" cy="46" r="1.6" />
        <circle cx="42" cy="47.5" r="1.6" />
        <circle cx="53.2" cy="47" r="1.6" />
        <circle cx="47.5" cy="52" r="1.6" />
        <circle cx="53.5" cy="42.8" r="1.3" />
        <circle cx="43" cy="52.5" r="1.3" />
      </g>
    </svg>
  )
}

/** The Paddl logo: the paddle and ball inside a soft dashed ring. */
export function Logo({ size = 64 }: { size?: number }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} className="absolute inset-0" aria-hidden>
        <circle cx="32" cy="32" r="30" fill="none" stroke="#22d3ee" strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="3 5" />
      </svg>
      <PaddleBall size={Math.round(size * 0.82)} />
    </div>
  )
}

/**
 * A small pickleball court seen from above, split by the net. Used behind each team on a court card.
 * 'near' = the half drawn at the bottom (service courts + kitchen at its top edge); 'far' mirrors it.
 */
export function HalfCourt({ side, className = '' }: { side: 'near' | 'far'; className?: string }) {
  const far = side === 'far'
  return (
    <svg viewBox="0 0 200 74" preserveAspectRatio="none" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {/* kitchen line (non-volley zone) next to the net */}
        <line x1="0" y1={far ? 66 : 8} x2="200" y2={far ? 66 : 8} strokeDasharray="5 4" />
        {/* centre line between the left and right service courts */}
        <line x1="100" y1={far ? 0 : 8} x2="100" y2={far ? 66 : 74} />
        {/* baseline and sidelines */}
        <line x1="0" y1={far ? 0 : 74} x2="200" y2={far ? 0 : 74} />
        <line x1="0" y1="0" x2="0" y2="74" />
        <line x1="200" y1="0" x2="200" y2="74" />
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
