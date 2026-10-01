/**
 * Animated CoreC logo — a hexagonal data-flow mark with pulsing nodes,
 * rotating core, and flowing data lines. Uses pure SVG + CSS animations
 * so it works without any JS animation library.
 */
export function AnimatedLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      className={className}
      role="img"
      aria-label="CoreC"
    >
      <defs>
        <linearGradient id="animHexGrad" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stop-color="hsl(var(--primary))" />
          <stop offset="1" stop-color="hsl(var(--primary) / 0.6)" />
        </linearGradient>
      </defs>

      {/* Hexagon body */}
      <polygon points="64,10 111,37 111,91 64,118 17,91 17,37" fill="url(#animHexGrad)" />

      {/* Inner hexagon ring — slow rotation */}
      <polygon
        points="64,24 99,44 99,84 64,104 29,84 29,44"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
        style={{
          transformOrigin: '64px 64px',
          animation: 'logo-spin 12s linear infinite',
        }}
      />

      {/* Data flow lines — dash flow animation */}
      <g stroke="currentColor" strokeOpacity="0.55" strokeWidth="2.5" fill="none">
        <line
          x1="68.4"
          y1="46.9"
          x2="80.6"
          y2="69.1"
          strokeDasharray="6 4"
          style={{ animation: 'logo-flow 2s linear infinite' }}
        />
        <line
          x1="76"
          y1="77"
          x2="52"
          y2="77"
          strokeDasharray="6 4"
          style={{ animation: 'logo-flow 2s linear infinite -0.66s' }}
        />
        <line
          x1="47.4"
          y1="69.1"
          x2="59.6"
          y2="46.9"
          strokeDasharray="6 4"
          style={{ animation: 'logo-flow 2s linear infinite -1.33s' }}
        />
      </g>

      {/* Three nodes — sequential pulse */}
      <circle
        cx="64"
        cy="39"
        r="9"
        fill="currentColor"
        style={{ animation: 'logo-pulse 2.4s ease-in-out infinite' }}
      />
      <circle
        cx="85"
        cy="77"
        r="9"
        fill="currentColor"
        style={{ animation: 'logo-pulse 2.4s ease-in-out infinite -0.8s' }}
      />
      <circle
        cx="43"
        cy="77"
        r="9"
        fill="currentColor"
        style={{ animation: 'logo-pulse 2.4s ease-in-out infinite -1.6s' }}
      />

      {/* Center core — counter-rotation */}
      <circle cx="64" cy="64" r="5.5" fill="currentColor" fillOpacity="0.9" />
      <circle
        cx="64"
        cy="64"
        r="2.5"
        fill="hsl(var(--primary))"
        style={{
          transformOrigin: '64px 64px',
          animation: 'logo-spin 6s linear infinite reverse',
        }}
      />
    </svg>
  )
}
