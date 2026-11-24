import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney, formatMonthDay, formatPercent, formatQuantity, formatShare } from '@/lib/format'
import { forecastsApi } from '@/lib/forecasts-api'
import type { WasteReason } from '@/lib/inventory-api'
import { reportsApi } from '@/lib/reports-api'
import { salesApi } from '@/lib/sales-api'
import { monthPeriod } from '@/pages/month/month-period'
import { currentLocale } from '@/i18n/language'
import { useT } from '@/i18n/language-context'
import { sentence } from '@/i18n/sentence'

const REASON_COLORS: Record<WasteReason, string> = {
  expired: 'bg-destructive',
  damaged: 'bg-signal',
  other: 'bg-muted-foreground',
}

// The month told as a short story: what came in, what was lost, what sold best and how it
// compares. Everything comes from the same reports as the dashboard, for one calendar month.
export function MonthPage() {
  const { store } = useCurrentUser()
  const t = useT()
  const money = (amount: string | number) => formatMoney(amount, store.currency)
  const [searchParams] = useSearchParams()
  const month = monthPeriod(searchParams.get('month'))
  const period = { dateFrom: month.dateFrom, dateTo: month.dateTo }
  const before = { dateFrom: month.previous.dateFrom, dateTo: month.previous.dateTo }

  const summary = useQuery({ queryKey: ['sales', 'summary', period], queryFn: () => salesApi.summary(period) })
  // Day by day, to see whether the shop already had sales back then (see `comparable` below).
  const previousDays = useQuery({ queryKey: ['sales', 'daily', before], queryFn: () => salesApi.daily(before) })
  const waste = useQuery({
    queryKey: ['batches', 'waste', period],
    queryFn: () => reportsApi.waste(period.dateFrom, period.dateTo),
  })
  const previousWaste = useQuery({
    queryKey: ['batches', 'waste', before],
    queryFn: () => reportsApi.waste(before.dateFrom, before.dateTo),
  })
  const top = useQuery({
    queryKey: ['sales', 'top-products', period],
    queryFn: () => reportsApi.topProducts(period.dateFrom, period.dateTo),
  })
  // Measured on the last four weeks, so it belongs to this month only.
  const accuracy = useQuery({
    queryKey: ['sales', 'forecast-accuracy'],
    queryFn: forecastsApi.accuracy,
    enabled: month.isCurrent,
  })

  const queries = [summary, previousDays, waste, previousWaste, top]
  const failed = queries.find((query) => query.isError)
  const ready = summary.data && previousDays.data && waste.data && previousWaste.data && top.data

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-hand text-2xl text-destructive">
            {formatMonthDay(month.dateFrom)} – {formatMonthDay(month.dateTo)}
          </p>
          <h2 className="text-4xl leading-tight font-bold md:text-5xl">{t.month.title(month.label)}</h2>
          <p className="mt-1 text-muted-foreground">{t.month.at(store.name)}</p>
        </div>
        <nav aria-label={t.month.months} className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link to={`/month?month=${month.previous.month}`}><ChevronLeft />{month.previous.label}</Link>
          </Button>
          {month.next && (
            <Button variant="secondary" asChild>
              <Link to={month.isCurrent ? '/month' : `/month?month=${month.next}`}>
                {monthPeriod(month.next).label}<ChevronRight />
              </Link>
            </Button>
          )}
        </nav>
      </header>

      {failed ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {failed.error?.message}
            <Button size="sm" variant="outline"
              onClick={() => queries.filter((query) => query.isError).forEach((query) => void query.refetch())}>
              {t.common.tryAgain}
            </Button>
          </AlertDescription>
        </Alert>
      ) : !ready ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-52 rounded-3xl" />)}
        </div>
      ) : summary.data.sales === 0 ? (
        <div className="rounded-3xl bg-card p-10 text-center shadow-soft">
          <p className="font-hand text-3xl">{t.month.quiet}</p>
          <p className="mt-1 text-muted-foreground">{t.month.noSales(month.label)}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(() => {
            const revenue = Number(summary.data.revenue)
            const profit = Number(summary.data.profit)
            const previousRevenue = previousDays.data.reduce((sum, day) => sum + Number(day.revenue), 0)
            // A shop that started in the middle of last month would look like it grew tenfold. So
            // compare only when there were sales in the first days of that period, which means
            // the history covers all of it.
            const comparable = previousDays.data.slice(0, 3).some((day) => day.sales > 0)
            const lost = Number(waste.data.total)
            const previousLost = Number(previousWaste.data.total)
            const reasons = [...waste.data.reasons].sort((a, b) => Number(b.value) - Number(a.value))
            const star = top.data[0]
            const model = accuracy.data?.models.find((item) => item.method === accuracy.data?.chosen)
            const compared = month.isCurrent ? t.month.sameDaysOf(month.previous.label) : month.previous.label
            const change = comparable && previousRevenue > 0 ? ((revenue - previousRevenue) / previousRevenue) * 100 : null

            return (
              <>
                <Story title={t.month.youSold} tone="ink">
                  <Big>{money(revenue)}</Big>
                  <p>
                    {sentence(t.month.kept(
                      <strong className="text-signal">{money(profit)}</strong>,
                      Math.round((profit / revenue) * 100),
                      summary.data.sales.toLocaleString(currentLocale()),
                    ))}
                  </p>
                </Story>

                <Story title={t.month.thrownAway}>
                  <Big className="text-destructive">{money(lost)}</Big>
                  {lost === 0 ? (
                    <p>{t.month.nothingWasted}</p>
                  ) : (
                    <>
                      <p>{t.month.mostlyText(t.month.mostly[reasons[0].reason])}</p>
                      <div aria-hidden className="mt-4 flex h-3 overflow-hidden rounded-full">
                        {reasons.map((reason) => (
                          <span key={reason.reason} className={REASON_COLORS[reason.reason]} style={{ flex: Number(reason.value) }} />
                        ))}
                      </div>
                      <p className="figures mt-2 text-sm text-muted-foreground">
                        {reasons.map((reason) => `${t.month.reasons[reason.reason]} ${money(reason.value)}`).join(' · ')}
                      </p>
                    </>
                  )}
                </Story>

                {star && (
                  <Story title={t.month.star} tone="good">
                    <p className="font-heading text-3xl leading-tight font-bold">{star.product.name}</p>
                    <p className="figures">
                      {t.month.starText(money(star.profit), formatQuantity(star.quantity, star.product.unit))}
                    </p>
                  </Story>
                )}

                <Story title={t.month.comparedWith(compared)} tone="soon">
                  {change === null ? (
                    <p className="font-heading text-2xl font-bold">
                      {t.month.nothingToCompare}
                    </p>
                  ) : (
                    <>
                      <Big>{change >= 0 ? '+' : '−'}{formatPercent(Math.abs(change))}</Big>
                      <p className="figures">
                        {t.month.soldChange(change >= 0, money(previousRevenue))}
                        {lost === previousLost
                          ? t.month.sameWaste
                          : t.month.wasteChange(money(Math.abs(lost - previousLost)), lost < previousLost)}
                      </p>
                    </>
                  )}
                </Story>

                {month.isCurrent && model && (
                  <Story title={t.month.forecastTitle}>
                    <Big>{formatShare(model.weekly_wape)}</Big>
                    <p>{t.month.offPerWeek}{model.weekly_wape && Number(model.weekly_wape) > 0
                      && t.month.roughly(Math.round(1 / Number(model.weekly_wape)))}.</p>
                  </Story>
                )}

                <section aria-label={t.month.inShort} className="flex items-center rounded-3xl border-2 border-dashed border-border p-7">
                  <p className="font-hand text-3xl leading-tight">
                    {change !== null && (change >= 0 && lost <= previousLost
                      ? t.month.better(month.previous.shortLabel)
                      : change < 0 ? t.month.quieter(month.previous.shortLabel) : '')}
                    {star && t.month.earnedMost(star.product.name)}
                    {reasons[0]?.reason === 'expired' && lost > 0 && t.month.watchExpiry}
                    {reasons[0]?.reason === 'damaged' && lost > 0 && t.month.handleWithCare}
                  </p>
                </section>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

const TONES = {
  plain: 'bg-card shadow-soft',
  // Dark in both themes: in the evening theme "primary" turns cream, and mustard can't be read on cream.
  ink: 'bg-primary text-primary-foreground dark:bg-[#14110e] dark:text-foreground',
  good: 'bg-good/12',
  soon: 'bg-warning',
}

function Story({ title, tone = 'plain', children }: { title: string; tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <section aria-label={title} className={`flex flex-col gap-2 rounded-3xl p-7 text-[1.0625rem] leading-relaxed ${TONES[tone]}`}>
      <h3 className={`font-sans text-sm font-extrabold ${tone === 'ink' ? 'text-primary-foreground/75 dark:text-foreground/75' : 'text-muted-foreground'}`}>
        {title}
      </h3>
      {children}
    </section>
  )
}

function Big({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`figures font-heading text-5xl leading-none font-bold ${className}`}>{children}</p>
}
