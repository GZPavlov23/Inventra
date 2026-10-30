import { useQuery } from '@tanstack/react-query'
import { CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { daysAgo, formatMoney, formatQuantity, today } from '@/lib/format'
import type { WasteReason } from '@/lib/inventory-api'
import { reportsApi } from '@/lib/reports-api'
import { type RankedRow, RankedBars } from '@/pages/dashboard/ranked-bars'

const REPORT_DAYS = 30
const RUNNING_OUT_ROWS = 6
// Anything past this many categories is folded into "Other", so the list stays readable.
const CATEGORY_ROWS = 6

const WASTE_REASONS: Record<WasteReason, string> = {
  expired: 'Expired',
  damaged: 'Damaged',
  other: 'Other reason',
}

const reportPeriod = () => ({ from: daysAgo(REPORT_DAYS - 1), to: today() })

function ReportState({ query, children }: {
  query: { isError: boolean; error: Error | null; isPending: boolean; refetch: () => unknown }
  children: ReactNode
}) {
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          {query.error?.message}
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>Try again</Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }
  return children
}

function Nothing({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <CircleCheck className="size-4 text-primary" />
      {children}
    </p>
  )
}

export function WastePanel() {
  const { store } = useCurrentUser()
  const { from, to } = reportPeriod()
  const waste = useQuery({
    // Starts with 'batches', so a write-off refreshes this report too.
    queryKey: ['batches', 'report', 'waste', from, to],
    queryFn: () => reportsApi.waste(from, to),
  })

  return (
    <ReportState query={waste}>
      {waste.data?.reasons.length === 0 ? (
        <Nothing>No goods were written off in the last {REPORT_DAYS} days.</Nothing>
      ) : waste.data && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <span className="text-2xl font-semibold tracking-tight text-foreground">
              {formatMoney(waste.data.total, store.currency)}
            </span>{' '}
            written off in the last {REPORT_DAYS} days, at purchase prices
          </p>
          <RankedBars
            label="Written off goods by reason"
            rows={waste.data.reasons.map(({ reason, value, write_offs: writeOffs }) => ({
              key: reason,
              label: WASTE_REASONS[reason],
              amount: Number(value),
              value: formatMoney(value, store.currency),
              detail: writeOffs === 1 ? '1 write-off' : `${writeOffs} write-offs`,
            }))}
          />
        </div>
      )}
    </ReportState>
  )
}

function daysLeftText(days: number): string {
  if (days === 0) return 'None left to sell'
  if (days < 1) return 'Less than a day'
  const rounded = Math.round(days)
  return rounded === 1 ? 'About 1 day left' : `About ${rounded} days left`
}

export function RunningOutPanel() {
  const running = useQuery({
    // Sales and stock both change this list, so it is asked for again on every visit.
    queryKey: ['sales', 'report', 'running-out'],
    queryFn: reportsApi.runningOut,
    refetchOnMount: 'always',
  })
  const items = running.data ?? []

  return (
    <ReportState query={running}>
      {items.length === 0 ? (
        <Nothing>No product will run out within a week.</Nothing>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Stock that can still be sold, divided by average daily sales of the last 14 days. A
            simple average, not a forecast.
          </p>
          <ul aria-label="Products running out" className="flex flex-col divide-y">
            {items.slice(0, RUNNING_OUT_ROWS).map(({ product, stock, average_daily_sales: average, days_left: days }) => (
              <li key={product.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link
                    to={`/inventory?q=${encodeURIComponent(product.name)}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {product.name}
                  </Link>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatQuantity(stock, product.unit)} left to sell,{' '}
                    {formatQuantity(Number(average).toFixed(1), product.unit)} a day on average
                  </p>
                </div>
                <Badge
                  variant={Number(days) === 0 ? 'destructive' : 'secondary'}
                  className={Number(days) === 0 ? '' : 'bg-amber-100 text-amber-900'}
                >
                  {daysLeftText(Number(days))}
                </Badge>
              </li>
            ))}
          </ul>
          {items.length > RUNNING_OUT_ROWS && (
            <p className="text-xs text-muted-foreground">And {items.length - RUNNING_OUT_ROWS} more</p>
          )}
        </div>
      )}
    </ReportState>
  )
}

export function TopProductsPanel() {
  const { store } = useCurrentUser()
  const { from, to } = reportPeriod()
  const top = useQuery({
    queryKey: ['sales', 'report', 'top-products', from, to],
    queryFn: () => reportsApi.topProducts(from, to),
  })
  const items = top.data ?? []

  return (
    <ReportState query={top}>
      {items.length === 0 ? (
        <Nothing>No sales in the last {REPORT_DAYS} days yet.</Nothing>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Profit in the last {REPORT_DAYS} days</p>
          <RankedBars
            label="Most profitable products"
            rows={items.map(({ product, quantity, profit }) => ({
              key: String(product.id),
              label: product.name,
              amount: Number(profit),
              value: formatMoney(profit, store.currency),
              detail: `${formatQuantity(quantity, product.unit)} sold`,
            }))}
          />
        </div>
      )}
    </ReportState>
  )
}

export function CategoriesPanel() {
  const { store } = useCurrentUser()
  const { from, to } = reportPeriod()
  const categories = useQuery({
    queryKey: ['sales', 'report', 'categories', from, to],
    queryFn: () => reportsApi.categories(from, to),
  })
  const items = categories.data ?? []
  const total = items.reduce((sum, item) => sum + Number(item.revenue), 0)

  const toRow = (key: string, label: string, revenue: number): RankedRow => ({
    key,
    label,
    amount: revenue,
    value: formatMoney(revenue, store.currency),
    detail: `${((revenue / total) * 100).toFixed(1)}%`,
  })
  const rows = items
    .slice(0, CATEGORY_ROWS)
    .map(({ category, revenue }) => toRow(category ?? 'none', category ?? 'No category', Number(revenue)))
  const rest = items.slice(CATEGORY_ROWS).reduce((sum, item) => sum + Number(item.revenue), 0)
  if (rest > 0) rows.push(toRow('other', 'Other categories', rest))

  return (
    <ReportState query={categories}>
      {items.length === 0 ? (
        <Nothing>No sales in the last {REPORT_DAYS} days yet.</Nothing>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Revenue in the last {REPORT_DAYS} days</p>
          <RankedBars label="Revenue by category" rows={rows} />
        </div>
      )}
    </ReportState>
  )
}
