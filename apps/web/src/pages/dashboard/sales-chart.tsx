import { useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDay, formatMoney, formatMonthDay } from '@/lib/format'
import type { DailySales } from '@/lib/sales-api'
import { chartNotes } from '@/pages/dashboard/chart-notes'
import { currentLocale } from '@/i18n/language'
import { useT } from '@/i18n/language-context'

// Colors are checked with a color-blindness validator: see --chart-1 and --chart-2 in index.css.
const SERIES = [
  { key: 'revenue', color: 'var(--chart-1)' },
  { key: 'profit', color: 'var(--chart-2)' },
] as const

type ChartRow = { index: number; day: string; revenue: number; profit: number }

// Shared by the notes: the handwriting font, with a halo in the card's colour so a note stays
// readable where it crosses a line.
const HAND = {
  fontFamily: 'var(--font-hand)',
  fontSize: 20,
  paintOrder: 'stroke',
  stroke: 'var(--card)',
  strokeWidth: 5,
  strokeLinejoin: 'round',
} as const

function LineKey({ color }: { color: string }) {
  return <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
}

function ChartTooltip({ active, payload, label, currency }: TooltipContentProps & { currency: string }) {
  const t = useT()
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 text-muted-foreground">{formatDay(String(label))}</p>
      {SERIES.map((series) => {
        const row = payload[0].payload as ChartRow
        return (
          <p key={series.key} className="flex items-center gap-2">
            <LineKey color={series.color} />
            <span className="font-medium figures">{formatMoney(row[series.key], currency)}</span>
            <span className="text-muted-foreground">{t.chart[series.key]}</span>
          </p>
        )
      })}
    </div>
  )
}

export function SalesChart({ days, currency }: { days: DailySales[]; currency: string }) {
  const t = useT()
  const [showTable, setShowTable] = useState(false)
  const rows: ChartRow[] = days.map(({ day, revenue, profit }, index) => ({
    index,
    day,
    revenue: Number(revenue),
    profit: Number(profit),
  }))
  const lastIndex = rows.length - 1
  const notes = chartNotes(rows)
  const bestOnRight = notes.best !== null && rows.findIndex((row) => row.day === notes.best?.day) > rows.length / 2
  const today = rows[lastIndex]
  const compactMoney = new Intl.NumberFormat(currentLocale(), {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 0,
  })

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={t.chart.legend} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map(({ key, color }) => (
          <li key={key} className="flex items-center gap-1.5">
            <LineKey color={color} />
            {t.chart[key]}
          </li>
        ))}
        <li>{t.chart.dashed}</li>
      </ul>

      {/* The notes in words, for screen readers; on screen they are written on the chart. */}
      <p className="sr-only">
        {notes.best && t.chart.bestDayWords(formatMoney(notes.best.revenue, currency), formatDay(notes.best.day))}
        {notes.quiet && t.chart.quietWords(notes.quiet.days, formatDay(notes.quiet.from), formatDay(notes.quiet.to))}
      </p>

      <div className="h-64" role="img" aria-label={t.chart.label}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            {notes.quiet && (
              <ReferenceArea
                x1={notes.quiet.from}
                x2={notes.quiet.to}
                ifOverflow="hidden"
                shape={({ x, y, width, height }: { x: number; y: number; width: number; height: number }) => (
                  // The words sit a third of the way down: the lines are low on quiet days, and the
                  // top is left to the best-day note.
                  <g data-note="quiet">
                    <rect x={x} y={y} width={width} height={height} rx={10} fill="var(--signal)" fillOpacity={0.12} />
                    <text x={x + width / 2} y={y + Math.min(56, height / 3)} textAnchor="middle" fill="var(--warning-foreground)" {...HAND}>
                      {t.chart.quiet(notes.quiet?.days ?? 0)}
                    </text>
                  </g>
                )}
              />
            )}
            <XAxis
              dataKey="day"
              tickFormatter={formatMonthDay}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              minTickGap={48}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            />
            <YAxis
              width={48}
              tickFormatter={(value: number) => compactMoney.format(value)}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            />
            <Tooltip
              content={(props) => <ChartTooltip {...props} currency={currency} />}
              cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {/* Straight lines, because a curve would draw values between days that never
                existed. Today isn't over, so its low number must not look like a collapse. */}
            {SERIES.flatMap(({ key, color }) => {
              const line = {
                type: 'linear',
                stroke: color,
                strokeWidth: 2,
                dot: false,
                activeDot: { r: 4, fill: color, stroke: 'var(--card)', strokeWidth: 2 },
                isAnimationActive: false,
              } as const
              return [
                <Line
                  {...line}
                  key={key}
                  dataKey={(row: ChartRow) => (row.index < lastIndex ? row[key] : null)}
                />,
                <Line
                  {...line}
                  key={`${key}-today`}
                  strokeDasharray="4 4"
                  dataKey={(row: ChartRow) => (row.index >= lastIndex - 1 ? row[key] : null)}
                />,
              ]
            })}
            {notes.best && (
              <ReferenceDot
                x={notes.best.day}
                y={notes.best.revenue}
                ifOverflow="visible"
                shape={({ cx = 0, cy = 0 }) => (
                  <g data-note="best">
                    <circle cx={cx} cy={cy} r={13} fill="none" stroke="var(--destructive)" strokeWidth={2.5}
                      strokeDasharray="62 20" strokeLinecap="round" />
                    <text x={bestOnRight ? cx - 20 : cx + 20} y={cy + 6} textAnchor={bestOnRight ? 'end' : 'start'}
                      fill="var(--destructive)" {...HAND}>
                      {t.chart.bestDay(formatMoney(notes.best?.revenue ?? 0, currency), formatMonthDay(notes.best?.day ?? ''))}
                    </text>
                  </g>
                )}
              />
            )}
            {today && (
              <ReferenceDot
                x={today.day}
                y={today.revenue}
                ifOverflow="visible"
                shape={({ cx = 0, cy = 0 }) => (
                  <text data-note="today" x={cx - 12} y={cy - 18} textAnchor="end" fill="var(--foreground)" {...HAND}>
                    {t.chart.todaySoFar}
                  </text>
                )}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <Button variant="ghost" size="sm" className="self-start" aria-expanded={showTable}
        onClick={() => setShowTable((shown) => !shown)}>
        {showTable ? t.chart.hideTable : t.chart.showTable}
      </Button>

      {showTable && (
        <div className="max-h-64 overflow-y-auto rounded-2xl bg-card shadow-soft">
          <Table>
            <TableCaption className="sr-only">{t.chart.tableCaption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t.chart.day}</TableHead>
                <TableHead className="text-right">{t.chart.sales}</TableHead>
                <TableHead className="text-right">{t.chart.revenue}</TableHead>
                <TableHead className="text-right">{t.chart.profit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...days].reverse().map(({ day, sales, revenue, profit }) => (
                <TableRow key={day}>
                  <TableCell>{formatDay(day)}</TableCell>
                  <TableCell className="text-right figures">{sales}</TableCell>
                  <TableCell className="text-right figures">{formatMoney(revenue, currency)}</TableCell>
                  <TableCell className="text-right figures">{formatMoney(profit, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
