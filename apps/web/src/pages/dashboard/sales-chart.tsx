import { useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
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

// Colors are checked with a color-blindness validator: see --chart-1 and --chart-2 in index.css.
const SERIES = [
  { key: 'revenue', label: 'Revenue', color: 'var(--chart-1)' },
  { key: 'profit', label: 'Profit', color: 'var(--chart-2)' },
] as const

type ChartRow = { index: number; day: string; revenue: number; profit: number }

function LineKey({ color }: { color: string }) {
  return <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
}

function ChartTooltip({ active, payload, label, currency }: TooltipContentProps & { currency: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 text-muted-foreground">{formatDay(String(label))}</p>
      {SERIES.map((series) => {
        const row = payload[0].payload as ChartRow
        return (
          <p key={series.key} className="flex items-center gap-2">
            <LineKey color={series.color} />
            <span className="font-medium tabular-nums">{formatMoney(row[series.key], currency)}</span>
            <span className="text-muted-foreground">{series.label}</span>
          </p>
        )
      })}
    </div>
  )
}

export function SalesChart({ days, currency }: { days: DailySales[]; currency: string }) {
  const [showTable, setShowTable] = useState(false)
  const rows: ChartRow[] = days.map(({ day, revenue, profit }, index) => ({
    index,
    day,
    revenue: Number(revenue),
    profit: Number(profit),
  }))
  const lastIndex = rows.length - 1
  const compactMoney = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 0,
  })

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map(({ key, label, color }) => (
          <li key={key} className="flex items-center gap-1.5">
            <LineKey color={color} />
            {label}
          </li>
        ))}
        <li>Dashed: today so far</li>
      </ul>

      <div className="h-64" role="img" aria-label="Revenue and profit per day. The table below shows the same numbers.">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
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
          </LineChart>
        </ResponsiveContainer>
      </div>

      <Button variant="ghost" size="sm" className="self-start" aria-expanded={showTable}
        onClick={() => setShowTable((shown) => !shown)}>
        {showTable ? 'Hide the table' : 'Show as a table'}
      </Button>

      {showTable && (
        <div className="max-h-64 overflow-y-auto rounded-lg border">
          <Table>
            <TableCaption className="sr-only">Revenue and profit per day</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...days].reverse().map(({ day, sales, revenue, profit }) => (
                <TableRow key={day}>
                  <TableCell>{formatDay(day)}</TableCell>
                  <TableCell className="text-right tabular-nums">{sales}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(revenue, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(profit, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
