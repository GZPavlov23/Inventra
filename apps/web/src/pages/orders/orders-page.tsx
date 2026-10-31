import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CircleCheck, Download, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { StatTile } from '@/components/stat-tile'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { downloadCsv } from '@/lib/csv'
import { formatMoney, lineCents, today } from '@/lib/format'
import { forecastsApi, type OrderLine, recommendedQuantity } from '@/lib/forecasts-api'
import { OrdersTable } from '@/pages/orders/orders-table'

const PERIODS = [7, 14]

export function OrdersPage() {
  const { store } = useCurrentUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const days = searchParams.get('days') === '14' ? 14 : 7

  const orders = useQuery({
    // Sales and stock both change this page, so it is asked for again on every visit.
    queryKey: ['sales', 'orders', days],
    queryFn: () => forecastsApi.orders(days),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  })

  // Only what the owner changed by hand. Everything else stays the recommendation.
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const lines = orders.data?.items
  const quantityOf = (line: OrderLine) => quantities[line.product.id] ?? recommendedQuantity(line)
  const totalCents = lines?.reduce((sum, line) => sum + lineCents(quantityOf(line), line.unit_cost), 0)
  const ordered = lines?.filter((line) => Number(quantityOf(line)) > 0)
  const edited = Object.keys(quantities).length > 0

  const changePeriod = (value: string) => {
    setQuantities({})
    setSearchParams(value === '14' ? { days: '14' } : {}, { replace: true })
  }

  const download = () => {
    downloadCsv(`inventra-order-${today()}.csv`, [
      ['product', 'barcode', 'quantity', 'unit', 'unit_cost', 'cost'],
      ...(ordered ?? []).map((line) => [
        line.product.name,
        line.product.barcode ?? '',
        quantityOf(line),
        line.product.unit,
        line.unit_cost,
        (lineCents(quantityOf(line), line.unit_cost) / 100).toFixed(2),
      ]),
    ])
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Orders</h2>
          <p className="text-sm text-muted-foreground">What to order, how much, and why.</p>
        </div>
        <Button onClick={download} disabled={!ordered?.length}>
          <Download />
          Download order
        </Button>
      </div>

      {orders.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {orders.error.message}
            <Button size="sm" variant="outline" onClick={() => void orders.refetch()}>Try again</Button>
          </AlertDescription>
        </Alert>
      ) : orders.data?.products_checked === 0 ? (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
            <EmptyTitle>Not enough sales yet</EmptyTitle>
            <EmptyDescription>
              Recommendations come from the forecast, which needs at least 14 days of sales for a product.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" asChild>
              <Link to="/sales">Go to Sales</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="Products to order"
              value={ordered?.length.toLocaleString()}
              note={orders.data && `Out of ${orders.data.products_checked} with a forecast`}
            />
            <StatTile
              label="Estimated cost"
              value={totalCents === undefined ? undefined : formatMoney(totalCents / 100, store.currency)}
              note="At current purchase prices"
            />
            <StatTile
              label="Safety buffer"
              value={orders.data && `${(Number(orders.data.buffer_share) * 100).toFixed(0)}%`}
              note="Extra, based on the forecast's error"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={String(days)} onValueChange={changePeriod}>
              <TabsList>
                {PERIODS.map((period) => (
                  <TabsTrigger key={period} value={String(period)}>Cover {period} days</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {edited && (
              <Button variant="ghost" size="sm" onClick={() => setQuantities({})}>
                Back to the recommendation
              </Button>
            )}
          </div>

          {!lines ? (
            <Skeleton className="h-64 w-full" />
          ) : lines.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
              <CircleCheck className="size-4 text-primary" />
              Your stock covers the next {days} days. There is nothing to order.
            </p>
          ) : (
            <div
              className={`rounded-lg border transition-opacity ${orders.isPlaceholderData ? 'opacity-60' : ''}`}
              aria-busy={orders.isFetching}
            >
              <OrdersTable
                lines={lines}
                quantities={quantities}
                currency={store.currency}
                onChange={(productId, quantity) =>
                  setQuantities((current) => ({ ...current, [productId]: quantity }))}
              />
            </div>
          )}

          {orders.data && (
            <p className="text-sm text-muted-foreground">
              Forecast model: {orders.data.method}, a simple statistical model. Stock that will expire
              before it sells isn't counted on. Orders are rounded up, so they can be a little above
              the sum shown. Pack sizes and suppliers aren't taken into account yet.
            </p>
          )}
        </>
      )}
    </div>
  )
}
