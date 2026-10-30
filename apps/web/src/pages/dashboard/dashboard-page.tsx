import { useQuery } from '@tanstack/react-query'
import { ReceiptText } from 'lucide-react'
import { Link } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { StatTile } from '@/components/stat-tile'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { daysAgo, formatMoney, today } from '@/lib/format'
import { inventoryApi } from '@/lib/inventory-api'
import { salesApi } from '@/lib/sales-api'
import { AttentionList } from '@/pages/dashboard/attention-list'
import { ReportsCard } from '@/pages/dashboard/reports-card'
import { SalesChart } from '@/pages/dashboard/sales-chart'

const CHART_DAYS = 30
const ATTENTION_ROWS = 6
const COMPARED_DAYS = 7

export function DashboardPage() {
  const { store } = useCurrentUser()
  const money = (amount: string) => formatMoney(amount, store.currency)

  const thisDay = { dateFrom: today(), dateTo: today() }
  const lastMonth = { dateFrom: daysAgo(CHART_DAYS - 1), dateTo: today() }
  // Finished days only: today would make every comparison look like a drop.
  const lastWeek = { dateFrom: daysAgo(COMPARED_DAYS), dateTo: daysAgo(1) }
  const weekBefore = { dateFrom: daysAgo(COMPARED_DAYS * 2), dateTo: daysAgo(COMPARED_DAYS + 1) }

  // Keys start with 'sales' and 'batches', so every sale or stock change refreshes this page too.
  const todaysSales = useQuery({
    queryKey: ['sales', 'summary', thisDay],
    queryFn: () => salesApi.summary(thisDay),
  })
  const monthSales = useQuery({
    queryKey: ['sales', 'summary', lastMonth],
    queryFn: () => salesApi.summary(lastMonth),
  })
  const weekSales = useQuery({
    queryKey: ['sales', 'summary', lastWeek],
    queryFn: () => salesApi.summary(lastWeek),
  })
  const previousWeekSales = useQuery({
    queryKey: ['sales', 'summary', weekBefore],
    queryFn: () => salesApi.summary(weekBefore),
  })
  const daily = useQuery({
    queryKey: ['sales', 'daily', lastMonth],
    queryFn: () => salesApi.daily(lastMonth),
  })
  const stock = useQuery({ queryKey: ['batches', 'summary'], queryFn: inventoryApi.summary })
  const expired = useQuery({
    queryKey: ['batches', { search: '', status: 'expired', page: 1 }, ATTENTION_ROWS],
    queryFn: () => inventoryApi.list({ search: '', status: 'expired', limit: ATTENTION_ROWS, offset: 0 }),
  })
  const expiring = useQuery({
    queryKey: ['batches', { search: '', status: 'expiring', page: 1 }, ATTENTION_ROWS],
    queryFn: () => inventoryApi.list({ search: '', status: 'expiring', limit: ATTENTION_ROWS, offset: 0 }),
  })

  const queries = [todaysSales, weekSales, previousWeekSales, monthSales, daily, stock, expired, expiring]
  const failed = queries.find((query) => query.isError)
  const attention =
    expired.data && expiring.data
      ? [...expired.data.items, ...expiring.data.items].slice(0, ATTENTION_ROWS)
      : undefined
  const attentionTotal = (expired.data?.total ?? 0) + (expiring.data?.total ?? 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground">{store.name}: how the store is doing today.</p>
      </div>

      {failed && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {failed.error?.message}
            <Button size="sm" variant="outline"
              onClick={() => queries.filter((query) => query.isError).forEach((query) => void query.refetch())}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Revenue today"
          value={todaysSales.data && money(todaysSales.data.revenue)}
          note={todaysSales.data && salesCount(todaysSales.data.sales)}
        />
        <StatTile
          label="Revenue, last 7 days"
          value={weekSales.data && money(weekSales.data.revenue)}
          note={weekSales.data && previousWeekSales.data
            && changeNote(weekSales.data.revenue, previousWeekSales.data.revenue)}
        />
        <StatTile
          label="Stock value"
          value={stock.data && money(stock.data.stock_value)}
          note="At purchase prices, without expired goods"
        />
        <StatTile
          label="Expired stock"
          value={stock.data && money(stock.data.expired_value)}
          note={stock.data && `${batchCount(stock.data.expired_batches)} to write off`}
        />
        <StatTile
          label="Expiring soon"
          value={stock.data?.expiring_batches.toLocaleString()}
          note="Batches, within 7 days"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue and profit</CardTitle>
            <CardDescription>
              {monthSales.data
                ? `Last ${CHART_DAYS} days: ${money(monthSales.data.revenue)} revenue, ${money(monthSales.data.profit)} profit`
                : `Last ${CHART_DAYS} days`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!daily.data || !monthSales.data ? (
              <Skeleton className="h-64 w-full" />
            ) : monthSales.data.sales === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><ReceiptText /></EmptyMedia>
                  <EmptyTitle>No sales yet</EmptyTitle>
                  <EmptyDescription>The chart fills up as soon as you record sales.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" asChild>
                    <Link to="/sales">Go to Sales</Link>
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <SalesChart days={daily.data} currency={store.currency} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>
              {attentionTotal > ATTENTION_ROWS
                ? `The first ${ATTENTION_ROWS} of ${attentionTotal} batches`
                : 'Expired goods first, then what expires soon'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {attention ? (
              <AttentionList batches={attention} />
            ) : (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ReportsCard />
    </div>
  )
}

function changeNote(current: string, previous: string): string {
  if (Number(previous) === 0) return 'Nothing to compare with yet'
  const change = ((Number(current) - Number(previous)) / Number(previous)) * 100
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}% vs the 7 days before`
}

function salesCount(count: number): string {
  return count === 1 ? '1 sale' : `${count.toLocaleString()} sales`
}

function batchCount(count: number): string {
  return count === 1 ? '1 batch' : `${count.toLocaleString()} batches`
}
