// BoardPilot mark: a chip with a navigation arrow. Source: assets/brand/boardpilot-mark.svg.

export function LogoMark({ size = 24 }: { size?: number }) {
  const pins = [22, 32, 42];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="logo-mark">
      <defs>
        <linearGradient id="bpm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2A4E7C" />
          <stop offset="1" stopColor="#132740" />
        </linearGradient>
        <linearGradient id="bpm-arrow" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5CCB8F" />
          <stop offset="1" stopColor="#9BF0C0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#bpm-bg)" />
      <g fill="#D9B45A">
        {pins.map((i) => (
          <g key={i}>
            <rect x={i - 2} y="9.5" width="4" height="6" rx="1" />
            <rect x={i - 2} y="48.5" width="4" height="6" rx="1" />
            <rect x="9.5" y={i - 2} width="6" height="4" rx="1" />
            <rect x="48.5" y={i - 2} width="6" height="4" rx="1" />
          </g>
        ))}
      </g>
      <rect x="15.5" y="15.5" width="33" height="33" rx="7" fill="#0E1822" stroke="#D9B45A" strokeWidth="2" />
      <path d="M41.5 22.5 L29 44.5 L28.2 35.8 L19.5 35 Z" fill="url(#bpm-arrow)" />
      <path d="M41.5 22.5 L28.2 35.8 L29 44.5 Z" fill="#000" opacity="0.18" />
      <circle cx="22.5" cy="41.5" r="1.6" fill="#C9BEFF" />
    </svg>
  );
}
