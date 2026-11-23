import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ReceiptText } from 'lucide-react'
import { Link } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { StatPanel, StatTile } from '@/components/stat-tile'
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
import { daysAgo, formatLongDay, formatMoney, partOfDay, today } from '@/lib/format'
import { inventoryApi } from '@/lib/inventory-api'
import { salesApi } from '@/lib/sales-api'
import { AttentionList } from '@/pages/dashboard/attention-list'
import { ReportsCard } from '@/pages/dashboard/reports-card'
import { SalesChart } from '@/pages/dashboard/sales-chart'
import { TodaysBriefing } from '@/pages/dashboard/briefing'
import { SetupChecklist } from '@/pages/dashboard/setup-checklist'
import { useStoreSetup } from '@/pages/dashboard/use-store-setup'

const CHART_DAYS = 30
const ATTENTION_ROWS = 6
const COMPARED_DAYS = 7
const LIVE_EVERY_MS = 60_000

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
    refetchInterval: LIVE_EVERY_MS,
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
    // Sales rung up on another till show up within a minute; sales made here, at once.
    refetchInterval: LIVE_EVERY_MS,
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
      <Greeting />

      <SetupChecklist />

      <TodaysBriefing />

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

      <StatPanel className="grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
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
      </StatPanel>

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

// The day starts with a person, not a page title.
function Greeting() {
  const user = useCurrentUser()
  const setup = useStoreSetup()
  const part = partOfDay()
  const firstName = user.full_name.trim().split(/\s+/)[0]
  // A new store isn't "your shop today" yet: first it has to be set up.
  const settingUp = setup.data !== undefined && !setup.data.done
  return (
    <div className="py-2 text-center">
      <p className="font-hand text-2xl text-destructive">{formatLongDay(today())}</p>
      <h2 className="mx-auto mt-1 max-w-3xl text-4xl leading-tight font-bold md:text-5xl">
        Good {part}, {firstName}! {settingUp ? `Let's get ${user.store.name} ready.` : "Here's your shop today."}
      </h2>
      <svg aria-hidden="true" width="240" height="14" viewBox="0 0 240 14" className="mx-auto mt-2 block">
        <path d="M3 9 C 55 2, 104 13, 152 6 S 218 4, 237 8" fill="none" stroke="var(--signal)" strokeWidth="5" strokeLinecap="round" />
      </svg>
      {/* A store still setting up has no month to look back on yet. */}
      {setup.data?.done && (
        <Button variant="secondary" size="sm" asChild className="mt-4">
          <Link to="/month">Your month so far<ArrowRight /></Link>
        </Button>
      )}
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
