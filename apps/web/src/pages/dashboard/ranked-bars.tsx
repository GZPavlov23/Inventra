export type RankedRow = {
  key: string
  label: string
  // The bar's length.
  amount: number
  value: string
  detail?: string
}

// Horizontal bars from one baseline, each with its value written beside it, so a list of long
// product names stays readable on a phone and nothing depends on hovering.
export function RankedBars({ rows, label }: { rows: RankedRow[]; label: string }) {
  const largest = Math.max(...rows.map((row) => row.amount), 0)

  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            {row.detail && <span className="shrink-0 text-xs text-muted-foreground">{row.detail}</span>}
            <span className="shrink-0 font-medium tabular-nums">{row.value}</span>
          </div>
          {/* Every bar has the full width to itself, so the lengths compare honestly. */}
          <div className="h-2">
            <div
              className="h-full rounded-r-sm bg-chart-1"
              style={{ width: `${largest > 0 ? Math.max((row.amount / largest) * 100, 1) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
