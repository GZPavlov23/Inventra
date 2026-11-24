import { useQuery } from '@tanstack/react-query'
import { CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { daysAgo, formatMoney, formatPercent, formatQuantity, today } from '@/lib/format'
import type { WasteReason } from '@/lib/inventory-api'
import { reportsApi } from '@/lib/reports-api'
import { type RankedRow, RankedBars } from '@/pages/dashboard/ranked-bars'
import { useT } from '@/i18n/language-context'
import type { Messages } from '@/i18n/en'
import { toApiError } from '@/lib/api'

const REPORT_DAYS = 30
const RUNNING_OUT_ROWS = 6
// Anything past this many categories is folded into "Other", so the list stays readable.
const CATEGORY_ROWS = 6


const reportPeriod = () => ({ from: daysAgo(REPORT_DAYS - 1), to: today() })

function ReportState({ query, children }: {
  query: { isError: boolean; error: Error | null; isPending: boolean; refetch: () => unknown }
  children: ReactNode
}) {
  const t = useT()
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          {query.error && toApiError(query.error).message}
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>{t.common.tryAgain}</Button>
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
      <CircleCheck className="size-4 text-good" />
      {children}
    </p>
  )
}

export function WastePanel() {
  const { store } = useCurrentUser()
  const t = useT()
  const { from, to } = reportPeriod()
  const waste = useQuery({
    // Starts with 'batches', so a write-off refreshes this report too.
    queryKey: ['batches', 'report', 'waste', from, to],
    queryFn: () => reportsApi.waste(from, to),
  })

  return (
    <ReportState query={waste}>
      {waste.data?.reasons.length === 0 ? (
        <Nothing>{t.reports.noWaste(REPORT_DAYS)}</Nothing>
      ) : waste.data && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <span className="text-2xl font-semibold tracking-tight text-foreground">
              {formatMoney(waste.data.total, store.currency)}
            </span>
            {t.reports.writtenOff(REPORT_DAYS)}
          </p>
          <RankedBars
            label={t.reports.wasteLabel}
            rows={waste.data.reasons.map(({ reason, value, write_offs: writeOffs }) => ({
              key: reason,
              label: t.reports.reasons[reason as WasteReason],
              amount: Number(value),
              value: formatMoney(value, store.currency),
              detail: t.reports.writeOffs(writeOffs),
            }))}
          />
        </div>
      )}
    </ReportState>
  )
}

function daysLeftText(days: number, t: Messages): string {
  if (days === 0) return t.reports.noneLeft
  if (days < 1) return t.reports.lessThanDay
  return t.reports.aboutDays(Math.round(days))
}

export function RunningOutPanel() {
  const t = useT()
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
        <Nothing>{t.reports.noRunningOut}</Nothing>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t.reports.runningOutExplained}</p>
          <ul aria-label={t.reports.runningOutLabel} className="flex flex-col divide-y">
            {items.slice(0, RUNNING_OUT_ROWS).map(({ product, stock, average_daily_sales: average, days_left: days }) => (
              <li key={product.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link
                    to={`/inventory?q=${encodeURIComponent(product.name)}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {product.name}
                  </Link>
                  <p className="text-xs text-muted-foreground figures">
                    {t.reports.leftToSell(formatQuantity(stock, product.unit), formatQuantity(Number(average).toFixed(1), product.unit))}
                  </p>
                </div>
                <Badge
                  variant={Number(days) === 0 ? 'destructive' : 'secondary'}
                  className={Number(days) === 0 ? '' : 'bg-warning text-warning-foreground'}
                >
                  {daysLeftText(Number(days), t)}
                </Badge>
              </li>
            ))}
          </ul>
          {items.length > RUNNING_OUT_ROWS && (
            <p className="text-xs text-muted-foreground">{t.reports.andMore(items.length - RUNNING_OUT_ROWS)}</p>
          )}
        </div>
      )}
    </ReportState>
  )
}

export function TopProductsPanel() {
  const { store } = useCurrentUser()
  const t = useT()
  const { from, to } = reportPeriod()
  const top = useQuery({
    queryKey: ['sales', 'report', 'top-products', from, to],
    queryFn: () => reportsApi.topProducts(from, to),
  })
  const items = top.data ?? []

  return (
    <ReportState query={top}>
      {items.length === 0 ? (
        <Nothing>{t.reports.noSales(REPORT_DAYS)}</Nothing>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t.reports.profitIn(REPORT_DAYS)}</p>
          <RankedBars
            label={t.reports.topLabel}
            rows={items.map(({ product, quantity, profit }) => ({
              key: String(product.id),
              label: product.name,
              amount: Number(profit),
              value: formatMoney(profit, store.currency),
              detail: t.reports.sold(formatQuantity(quantity, product.unit)),
            }))}
          />
        </div>
      )}
    </ReportState>
  )
}

export function CategoriesPanel() {
  const { store } = useCurrentUser()
  const t = useT()
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
    detail: formatPercent((revenue / total) * 100),
  })
  const rows = items
    .slice(0, CATEGORY_ROWS)
    .map(({ category, revenue }) => toRow(category ?? 'none', category ?? t.reports.noCategory, Number(revenue)))
  const rest = items.slice(CATEGORY_ROWS).reduce((sum, item) => sum + Number(item.revenue), 0)
  if (rest > 0) rows.push(toRow('other', t.reports.otherCategories, rest))

  return (
    <ReportState query={categories}>
      {items.length === 0 ? (
        <Nothing>{t.reports.noSales(REPORT_DAYS)}</Nothing>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t.reports.revenueIn(REPORT_DAYS)}</p>
          <RankedBars label={t.reports.categoriesLabel} rows={rows} />
        </div>
      )}
    </ReportState>
  )
}
