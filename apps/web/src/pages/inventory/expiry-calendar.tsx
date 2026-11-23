import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { DetailsPanel } from '@/components/details-panel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  addDays,
  daysUntil,
  formatLongDay,
  formatMoney,
  formatMonthDay,
  formatQuantity,
  startOfWeek,
  today,
} from '@/lib/format'
import { type ExpiryCalendar, inventoryApi } from '@/lib/inventory-api'

// Five weeks: about a month, starting on this week's Monday, so today is always in the first row.
const WEEKS = 5
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// The same rule as the inventory list's "Expiring soon": today and the next 7 days.
const SOON_DAYS = 7
// Product lines written in a day's square; the rest are one click away.
const LINES_IN_A_DAY = 2

type Day = ExpiryCalendar['days'][number]

function tone(day: string): 'loss' | 'soon' | 'later' {
  const days = daysUntil(day)
  return days < 0 ? 'loss' : days <= SOON_DAYS ? 'soon' : 'later'
}

const TONES = {
  loss: { square: 'bg-destructive/12', amount: 'text-destructive' },
  soon: { square: 'bg-warning', amount: 'text-warning-foreground' },
  later: { square: 'bg-good/12', amount: 'text-good' },
}

// The shelf's calendar: each day shows what expires on it and what was paid for it, so a
// heavy day can be seen coming and those goods put at the front, or ordered less of.
export function ExpiryCalendarView() {
  const { store } = useCurrentUser()
  const money = (amount: string) => formatMoney(amount, store.currency)
  const [offset, setOffset] = useState(0)
  const [openDay, setOpenDay] = useState<Day | undefined>()
  const [panelOpen, setPanelOpen] = useState(false)

  const first = addDays(startOfWeek(today()), offset * WEEKS * 7)
  const last = addDays(first, WEEKS * 7 - 1)
  const calendar = useQuery({
    // Starts with 'batches', so receiving, selling or writing off refreshes it too.
    queryKey: ['batches', 'expiry-calendar', first, last],
    queryFn: () => inventoryApi.expiryCalendar(first, last),
    placeholderData: keepPreviousData,
  })

  const byDay = new Map(calendar.data?.days.map((day) => [day.day, day]))
  const heaviest = calendar.data?.days.reduce<Day | undefined>(
    (top, day) => (!top || Number(day.value) > Number(top.value) ? day : top), undefined)
  const show = (day: Day) => {
    setOpenDay(day)
    setPanelOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon-sm" aria-label="Earlier weeks" onClick={() => setOffset(offset - 1)}>
            <ChevronLeft />
          </Button>
          <p className="figures min-w-36 text-center font-bold" aria-live="polite">
            {formatMonthDay(first)} – {formatMonthDay(last)}
          </p>
          <Button variant="secondary" size="icon-sm" aria-label="Later weeks" onClick={() => setOffset(offset + 1)}>
            <ChevronRight />
          </Button>
          {offset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setOffset(0)}>This week</Button>
          )}
        </div>
        {calendar.data && (
          <p className="figures text-sm text-muted-foreground">
            {money(calendar.data.total)} expires in these {WEEKS} weeks, at purchase prices
          </p>
        )}
      </div>

      {calendar.data && calendar.data.overdue.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span className="figures">
              {calendar.data.overdue.length === 1 ? '1 batch' : `${calendar.data.overdue.length} batches`} expired
              before {formatMonthDay(first)} and {calendar.data.overdue.length === 1 ? 'is' : 'are'} still on the
              shelf: {money(calendar.data.overdue_value)}.
            </span>
            <Button size="sm" variant="outline" asChild>
              <Link to="/inventory?status=expired">See them</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {calendar.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {calendar.error.message}
            <Button size="sm" variant="outline" onClick={() => void calendar.refetch()}>Try again</Button>
          </AlertDescription>
        </Alert>
      ) : !calendar.data ? (
        <Skeleton className="h-[36rem] w-full rounded-2xl" />
      ) : (
        <>
          {/* Wide screens: the month as a grid of days. */}
          <div className="hidden md:block">
            <div aria-hidden className="mb-2 grid grid-cols-7 gap-2 px-1 text-xs font-bold text-muted-foreground">
              {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <ol aria-label="Expiry calendar" className="grid grid-cols-7 gap-2">
              {Array.from({ length: WEEKS * 7 }, (_, index) => {
                const date = addDays(first, index)
                const day = byDay.get(date)
                const isToday = date === today()
                const label = `${index === 0 || date.endsWith('-01') ? formatMonthDay(date) : Number(date.slice(8))}${isToday ? ' · today' : ''}`
                const past = daysUntil(date) < 0
                if (!day) {
                  return (
                    <li key={date} className={`min-h-28 rounded-2xl bg-card p-2.5 shadow-soft ${past ? 'opacity-55' : ''} ${isToday ? 'outline-2 -outline-offset-2 outline-foreground' : ''}`}>
                      <span className="figures text-xs font-bold">{label}</span>
                    </li>
                  )
                }
                const colors = TONES[tone(date)]
                return (
                  <li key={date}>
                    <button
                      type="button"
                      onClick={() => show(day)}
                      aria-label={`${formatLongDay(date)}: ${money(day.value)}, ${day.batches.length === 1 ? '1 batch' : `${day.batches.length} batches`}`}
                      className={`flex size-full min-h-28 flex-col items-start rounded-2xl p-2.5 text-left transition-transform hover:-translate-y-0.5 ${colors.square} ${isToday ? 'outline-2 -outline-offset-2 outline-foreground' : ''}`}
                    >
                      <span className="figures text-xs font-bold">{label}</span>
                      <span className={`figures mt-1 font-heading text-lg leading-tight font-bold ${colors.amount}`}>
                        {money(day.value)}
                      </span>
                      {day.batches.slice(0, LINES_IN_A_DAY).map((batch) => (
                        <span key={batch.batch_id} className="figures w-full truncate text-[0.6875rem] leading-snug">
                          {batch.product.name} · {formatQuantity(batch.remaining_quantity, batch.product.unit)}
                        </span>
                      ))}
                      {day.batches.length > LINES_IN_A_DAY && (
                        <span className="text-[0.6875rem] font-bold">+{day.batches.length - LINES_IN_A_DAY} more</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>

          {/* Phones: seven columns don't fit, so only the days that have something, as a list. */}
          <ol aria-label="Days with goods expiring" className="flex flex-col gap-2 md:hidden">
            {calendar.data.days.length === 0 && (
              <li className="rounded-2xl bg-card p-5 text-center text-muted-foreground shadow-soft">
                Nothing expires in these weeks.
              </li>
            )}
            {calendar.data.days.map((day) => {
              const colors = TONES[tone(day.day)]
              return (
                <li key={day.day}>
                  <button type="button" onClick={() => show(day)}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left ${colors.square}`}>
                    <span className="min-w-0">
                      <span className="block font-bold">{formatLongDay(day.day)}</span>
                      <span className="figures block truncate text-sm">
                        {day.batches.map((batch) => batch.product.name).join(', ')}
                      </span>
                    </span>
                    <span className={`figures shrink-0 font-heading text-lg font-bold ${colors.amount}`}>{money(day.value)}</span>
                  </button>
                </li>
              )
            })}
          </ol>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <ul aria-label="What the colours mean" className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded bg-destructive/40" />Expired, still on the shelf</li>
              <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded bg-signal" />Today and the next {SOON_DAYS} days</li>
              <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded bg-good/50" />Later</li>
            </ul>
            {heaviest && (
              <p className="font-hand text-2xl text-warning-foreground">
                the heaviest day: {formatLongDay(heaviest.day)}, {money(heaviest.value)}
              </p>
            )}
          </div>
        </>
      )}

      <DetailsPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={openDay ? formatLongDay(openDay.day) : ''}
        description={openDay && `${money(openDay.value)} expires this day, at purchase prices`}
      >
        {openDay && (
          <ul className="flex flex-col divide-y divide-border/70">
            {openDay.batches.map((batch) => (
              <li key={batch.batch_id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-bold">{batch.product.name}</p>
                  <p className="figures text-sm text-muted-foreground">
                    {formatQuantity(batch.remaining_quantity, batch.product.unit)} left
                    {batch.lot_code && ` · lot ${batch.lot_code}`}
                  </p>
                  <Link
                    to={`/inventory?q=${encodeURIComponent(batch.product.barcode ?? batch.product.name)}`}
                    className="text-sm font-bold underline-offset-4 hover:underline"
                    onClick={() => setPanelOpen(false)}
                  >
                    Show in the list
                  </Link>
                </div>
                <span className="figures font-bold">{money(batch.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </DetailsPanel>
    </div>
  )
}
