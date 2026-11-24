import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CircleCheck, Download, TrendingUp, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { StatPanel, StatTile } from '@/components/stat-tile'
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
import { formatMoney, formatPercent, lineCents, today } from '@/lib/format'
import { forecastsApi, type OrderLine, recommendedQuantity } from '@/lib/forecasts-api'
import { CreateDeliveriesDialog } from '@/pages/orders/create-deliveries-dialog'
import { OrdersTable } from '@/pages/orders/orders-table'
import { currentLocale } from '@/i18n/language'
import { useT } from '@/i18n/language-context'

const PERIODS = [7, 14]

export function OrdersPage() {
  const { store } = useCurrentUser()
  const t = useT()
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
  const [createOpen, setCreateOpen] = useState(false)

  const changePeriod = (value: string) => {
    setQuantities({})
    setSearchParams(value === '14' ? { days: '14' } : {}, { replace: true })
  }

  const download = () => {
    downloadCsv(`inventra-order-${today()}.csv`, [
      t.orders.csvColumns,
      ...(ordered ?? []).map((line) => [
        line.product.name,
        line.product.barcode ?? '',
        quantityOf(line),
        t.units[line.product.unit],
        line.unit_cost,
        (lineCents(quantityOf(line), line.unit_cost) / 100).toFixed(2),
        line.supplier?.name ?? '',
      ]),
    ])
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t.nav.orders}</h2>
          <p className="text-sm text-muted-foreground">{t.orders.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={download} disabled={!ordered?.length}>
            <Download />
            {t.orders.download}
          </Button>
          <Button onClick={() => setCreateOpen(true)} disabled={!ordered?.length}>
            <Truck />
            {t.orders.create}
          </Button>
        </div>
      </div>

      {orders.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {orders.error.message}
            <Button size="sm" variant="outline" onClick={() => void orders.refetch()}>{t.common.tryAgain}</Button>
          </AlertDescription>
        </Alert>
      ) : orders.data?.products_checked === 0 ? (
        <Empty className="rounded-2xl bg-card shadow-soft">
          <EmptyHeader>
            <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
            <EmptyTitle>{t.forecast.notEnough}</EmptyTitle>
            <EmptyDescription>
              {t.orders.notEnoughText}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" asChild>
              <Link to="/sales">{t.forecast.goToSales}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <StatPanel className="grid-cols-2 sm:grid-cols-3">
            <StatTile
              label={t.orders.toOrder}
              value={ordered?.length.toLocaleString(currentLocale())}
              note={orders.data && t.orders.outOf(orders.data.products_checked)}
            />
            <StatTile
              label={t.orders.estimatedCost}
              value={totalCents === undefined ? undefined : formatMoney(totalCents / 100, store.currency)}
              note={t.orders.atCurrentPrices}
            />
            <StatTile
              label={t.orders.buffer}
              value={orders.data && formatPercent(Number(orders.data.buffer_share) * 100, 0)}
              note={t.orders.bufferNote}
            />
          </StatPanel>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={String(days)} onValueChange={changePeriod}>
              <TabsList>
                {PERIODS.map((period) => (
                  <TabsTrigger key={period} value={String(period)}>{t.orders.cover(period)}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {edited && (
              <Button variant="ghost" size="sm" onClick={() => setQuantities({})}>
                {t.orders.backToRecommendation}
              </Button>
            )}
          </div>

          {!lines ? (
            <Skeleton className="h-64 w-full" />
          ) : lines.length === 0 ? (
            <p className="flex items-center gap-2 rounded-2xl bg-card shadow-soft p-4 text-sm text-muted-foreground">
              <CircleCheck className="size-4 text-good" />
              {t.orders.covered(days)}
            </p>
          ) : (
            <div
              className={`rounded-2xl bg-card shadow-soft transition-opacity ${orders.isPlaceholderData ? 'opacity-60' : ''}`}
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
              {t.orders.footer(t.common.models[orders.data.method] ?? orders.data.method)}
            </p>
          )}
        </>
      )}

      <CreateDeliveriesDialog
        lines={ordered ?? []}
        quantityOf={quantityOf}
        currency={store.currency}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => setQuantities({})}
      />
    </div>
  )
}
