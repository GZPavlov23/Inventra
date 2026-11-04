const WIDTH = 56
const HEIGHT = 20
const PADDING = 2

// A tiny line of daily numbers: the shape of the last weeks at a glance, no axes and no labels.
// The exact numbers are in the label, for screen readers and on hover.
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const highest = Math.max(...values)
  const step = (WIDTH - PADDING * 2) / Math.max(values.length - 1, 1)
  const points = values.map((value, index) => {
    const x = PADDING + index * step
    const y = highest === 0 ? HEIGHT - PADDING : HEIGHT - PADDING - (value / highest) * (HEIGHT - PADDING * 2)
    return [x, y] as const
  })
  const [lastX, lastY] = points[points.length - 1] ?? [0, 0]

  return (
    <svg role="img" aria-label={label} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={highest === 0 ? 'text-muted-foreground/50' : 'text-primary'}>
      <title>{label}</title>
      <polyline points={points.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {highest > 0 && <circle cx={lastX} cy={lastY} r="1.75" fill="currentColor" />}
    </svg>
  )
}
