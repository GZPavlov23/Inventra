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
import { currentLocale } from '@/i18n/language'
import { useT } from '@/i18n/language-context'

const HORIZONS = [7, 14]

export function ForecastPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const t = useT()
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
        <h2 className="text-2xl font-semibold tracking-tight">{t.nav.forecast}</h2>
        <p className="text-sm text-muted-foreground">
          {t.forecast.subtitle}
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
              {t.common.tryAgain}
            </Button>
          </AlertDescription>
        </Alert>
      ) : items?.length === 0 ? (
        <Empty className="rounded-2xl bg-card shadow-soft">
          <EmptyHeader>
            <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
            <EmptyTitle>{t.forecast.notEnough}</EmptyTitle>
            <EmptyDescription>
              {t.forecast.notEnoughText}
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label={t.forecast.runningShort}
              value={short?.toLocaleString(currentLocale())}
              note={t.forecast.withinDays(horizon)}
            />
            <StatTile
              label={t.forecast.enoughStock}
              value={items && short !== undefined ? (items.length - short).toLocaleString(currentLocale()) : undefined}
              note={t.forecast.forDays(horizon)}
            />
            <StatTile
              label={t.forecast.errorPerWeek}
              value={accuracy.data && formatShare(weeklyError)}
              note={t.forecast.measured}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={String(horizon)}
              onValueChange={(value) => setSearchParams(value === '14' ? { days: '14' } : {}, { replace: true })}
            >
              <TabsList>
                {HORIZONS.map((days) => (
                  <TabsTrigger key={days} value={String(days)}>{t.forecast.nextDays(days)}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {forecast.data && (
              <p className="text-sm text-muted-foreground">{t.forecast.model(t.common.models[forecast.data.method] ?? forecast.data.method)}</p>
            )}
          </div>

          {items ? (
            <div
              className={`rounded-2xl bg-card shadow-soft transition-opacity ${forecast.isPlaceholderData ? 'opacity-60' : ''}`}
              aria-busy={forecast.isFetching}
            >
              <ForecastTable items={items} onOpen={openDetails} />
            </div>
          ) : (
            <Skeleton className="h-64 w-full" />
          )}

          {forecast.data && forecast.data.not_enough_history > 0 && (
            <p className="text-sm text-muted-foreground">
              {t.forecast.tooLittle(forecast.data.not_enough_history)}
            </p>
          )}

          {accuracy.data && <AccuracyCard accuracy={accuracy.data} />}
        </>
      )}

      <ForecastDetailsDialog item={viewing} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </div>
  )
}
