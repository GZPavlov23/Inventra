import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

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
import { formatShare } from '@/lib/format'
import { forecastsApi, type ProductForecast } from '@/lib/forecasts-api'
import { AccuracyCard } from '@/pages/forecast/accuracy-card'
import { ForecastDetailsDialog } from '@/pages/forecast/forecast-details-dialog'
import { ForecastTable } from '@/pages/forecast/forecast-table'

const HORIZONS = [7, 14]

export function ForecastPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const horizon = searchParams.get('days') === '14' ? 14 : 7

  const forecast = useQuery({
    // Sales and stock both change this page, so it is asked for again on every visit.
    queryKey: ['sales', 'forecast', horizon],
    queryFn: () => forecastsApi.forecast(horizon),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  })
  const accuracy = useQuery({
    queryKey: ['sales', 'forecast', 'accuracy'],
    queryFn: forecastsApi.accuracy,
    refetchOnMount: 'always',
  })

  // Kept separately from `detailsOpen`, so the dialog keeps its content while it closes.
  const [viewing, setViewing] = useState<ProductForecast | undefined>()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const openDetails = (item: ProductForecast) => {
    setViewing(item)
    setDetailsOpen(true)
  }

  const failed = [forecast, accuracy].find((query) => query.isError)
  const items = forecast.data?.items
  const short = items?.filter((item) => Number(item.shortage) > 0).length
  const chosen = accuracy.data?.models.find((model) => model.method === accuracy.data.chosen)
  const weeklyError = chosen?.weekly_wape ?? null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Forecast</h2>
        <p className="text-sm text-muted-foreground">
          What you can expect to sell, and what will run short before then.
        </p>
      </div>

      {failed ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {failed.error?.message}
            <Button size="sm" variant="outline"
              onClick={() => {
                void forecast.refetch()
                void accuracy.refetch()
              }}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : items?.length === 0 ? (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
            <EmptyTitle>Not enough sales yet</EmptyTitle>
            <EmptyDescription>
              A forecast needs at least 14 days of sales for a product. Record your sales, or import
              your old history from a CSV file.
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
              label="Running short"
              value={short?.toLocaleString()}
              note={`Products, within ${horizon} days`}
            />
            <StatTile
              label="Enough stock"
              value={items && short !== undefined ? (items.length - short).toLocaleString() : undefined}
              note={`Products, for ${horizon} days`}
            />
            <StatTile
              label="Error per week"
              value={accuracy.data && formatShare(weeklyError)}
              note="Measured on your last 4 weeks"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={String(horizon)}
              onValueChange={(value) => setSearchParams(value === '14' ? { days: '14' } : {}, { replace: true })}
            >
              <TabsList>
                {HORIZONS.map((days) => (
                  <TabsTrigger key={days} value={String(days)}>Next {days} days</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {forecast.data && (
              <p className="text-sm text-muted-foreground">Model: {forecast.data.method}</p>
            )}
          </div>

          {items ? (
            <div
              className={`rounded-lg border transition-opacity ${forecast.isPlaceholderData ? 'opacity-60' : ''}`}
              aria-busy={forecast.isFetching}
            >
              <ForecastTable items={items} onOpen={openDetails} />
            </div>
          ) : (
            <Skeleton className="h-64 w-full" />
          )}

          {forecast.data && forecast.data.not_enough_history > 0 && (
            <p className="text-sm text-muted-foreground">
              {forecast.data.not_enough_history === 1
                ? '1 more product has'
                : `${forecast.data.not_enough_history} more products have`}{' '}
              less than 14 days of sales, which is too little to forecast.
            </p>
          )}

          {accuracy.data && <AccuracyCard accuracy={accuracy.data} />}
        </>
      )}

      <ForecastDetailsDialog item={viewing} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </div>
  )
}
