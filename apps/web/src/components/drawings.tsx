// Small ink drawings, made for Inventra in the same pen as the greeting's underline: lines in the
// text colour, with one soft touch of colour. They are decoration, so screen readers skip them.

export function CaughtUpDrawing({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 190 130" fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* The counter */}
      <path d="M 10 116 L 180 116" />
      {/* A cup of tea, still warm */}
      <path d="M 52 62 L 58 112 Q 59 116 64 116 L 104 116 Q 109 116 110 112 L 116 62 Z" />
      <path d="M 116 74 C 136 72, 138 98, 113 100" />
      <path d="M 70 50 C 64 40, 78 34, 72 22" />
      <path d="M 86 48 C 80 36, 94 30, 88 16" />
      <path d="M 102 50 C 96 40, 110 34, 104 24" />
      {/* The till, closed */}
      <path d="M 132 116 L 132 84 L 168 84 L 168 116" />
      <path d="M 138 84 L 138 74 L 162 74 L 162 84" />
      <path d="M 142 96 L 158 96 M 142 104 L 154 104" />
      {/* A leaf */}
      <path d="M 24 112 C 26 98, 34 92, 40 90 C 38 100, 32 108, 24 112 Z" fill="var(--good)" fillOpacity="0.25"
        stroke="var(--good)" />
    </svg>
  )
}
