import { useGSAP } from '@gsap/react'
import { useQuery } from '@tanstack/react-query'
import gsap from 'gsap'
import { ArrowRight, CircleCheck, Phone } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { Link } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { daysUntil, formatDay, formatDayOfWeek, formatExpected, formatMoney, formatWeekday, today } from '@/lib/format'
import { type BriefingNote, reportsApi } from '@/lib/reports-api'

// Read in passing, so a few at first; the rest are one click away.
const SHOWN_AT_FIRST = 5
// Someone else may sell or receive goods while the dashboard stays open on the counter.
const REFRESH_EVERY_MS = 60_000

// "today", "tomorrow", "on Friday" within a week, a date further away.
function when(day: string): string {
  const days = daysUntil(day)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days > 1 && days < 7) return `on ${formatDayOfWeek(day)}`
  return `on ${formatDay(day)}`
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

// Colour says what kind of thing it is, the same everywhere in the app: red is a loss that
// already happened or a promise broken, amber is a loss coming, green is good news.
const TONES = {
  loss: 'bg-destructive/10 text-destructive',
  soon: 'bg-warning text-warning-foreground',
  good: 'bg-primary/10 text-primary',
} as const

// Small and grey until the row is pointed at: the words say what to do, the icon only takes
// you there. Its name is still read out, and shown on hover.
const ACTION = '-mr-1.5 text-muted-foreground group-hover:text-primary'

type Written = {
  tag: string
  tone: keyof typeof TONES
  text: ReactNode
  amount: string
  // What the amount is, in two or three words.
  meaning: string
  action: ReactNode
}

// Each kind of fact, said in words. The server only sends facts, so the mobile app can say
// them its own way.
function write(note: BriefingNote, money: (amount: string) => string): Written {
  const product = note.product && <strong className="font-medium">{note.product.name}</strong>
  const quantity = (value: string) => (note.product ? formatExpected(value, note.product.unit) : value)
  const go = (to: string, label: string) => (
    <Button variant="ghost" size="icon-sm" className={ACTION} asChild>
      <Link to={to} aria-label={label} title={label}><ArrowRight /></Link>
    </Button>
  )

  switch (note.kind) {
    case 'expired':
      return {
        tag: 'Expired',
        tone: 'loss',
        text: note.batches === 1
          ? '1 batch has expired but still counts as stock.'
          : `${plural(note.batches ?? 0, 'batch', 'batches')} have expired but still count as stock.`,
        amount: money(note.at_stake),
        meaning: 'to write off',
        action: go('/inventory?status=expired', 'Write off'),
      }
    case 'late_delivery': {
      const late = -daysUntil(note.day ?? today())
      return {
        tag: 'Late',
        tone: 'loss',
        text: (
          <>
            <strong className="font-medium">{note.supplier?.name}</strong> is {plural(late, 'day', 'days')} late
            {note.deliveries && note.deliveries > 1
              ? ` with ${note.deliveries} deliveries.`
              : ` with delivery #${note.delivery_id}.`}
          </>
        ),
        amount: money(note.at_stake),
        meaning: 'ordered',
        action: note.supplier?.phone ? (
          <Button variant="ghost" size="icon-sm" className={ACTION} asChild>
            <a href={`tel:${note.supplier.phone}`} aria-label={`Call ${note.supplier.phone}`}
              title={`Call ${note.supplier.phone}`}><Phone /></a>
          </Button>
        ) : go('/deliveries', 'Open'),
      }
    }
    case 'runs_out':
      return {
        tag: 'Runs out',
        tone: 'soon',
        text: note.delivery_day
          ? <>{product} runs out {when(note.day ?? today())}, but the next delivery comes {when(note.delivery_day)}.</>
          : <>{product} runs out {when(note.day ?? today())} and nothing is on the way.</>,
        amount: `~${money(note.at_stake)}`,
        meaning: 'in missed sales',
        action: go('/orders', 'Order'),
      }
    case 'expires_unsold':
      return {
        tag: 'Will expire',
        tone: 'soon',
        text: <>About {quantity(note.quantity ?? '0')} of {product} will expire before it sells, the first {when(note.day ?? today())}.</>,
        amount: money(note.at_stake),
        meaning: 'at purchase price',
        action: go(`/inventory?q=${encodeURIComponent(note.product?.name ?? '')}`, 'See batches'),
      }
    case 'above_forecast': {
      const sold = Number(note.quantity)
      const expected = Number(note.expected)
      const more = expected > 0 ? Math.round(((sold - expected) / expected) * 100) : 0
      return {
        tag: 'Selling fast',
        tone: 'good',
        text: <>{product} sold {quantity(note.quantity ?? '0')} last week, {more}% more than the forecast of {quantity(note.expected ?? '0')}.</>,
        amount: money(note.at_stake),
        meaning: 'more in sales',
        action: go('/forecast', 'Forecast'),
      }
    }
  }
}

export function TodaysBriefing() {
  const { store } = useCurrentUser()
  const money = (amount: string) => formatMoney(amount, store.currency)
  const [showAll, setShowAll] = useState(false)
  const briefing = useQuery({
    // Stock, sales and deliveries all change it, so it is asked for again on every visit.
    queryKey: ['sales', 'briefing'],
    queryFn: reportsApi.briefing,
    refetchOnMount: 'always',
    // Only while the tab is visible: a hidden dashboard doesn't need to keep asking.
    refetchInterval: REFRESH_EVERY_MS,
  })

  const notes = briefing.data?.notes ?? []
  const shown = showAll ? notes : notes.slice(0, SHOWN_AT_FIRST)
  const hidden = notes.length - shown.length
  const canShowFewer = showAll && notes.length > SHOWN_AT_FIRST
  // Good news isn't money at risk, so selling fast stays out of this sum.
  const atRisk = notes
    .filter((note) => note.kind !== 'above_forecast')
    .reduce((sum, note) => sum + Number(note.at_stake), 0)

  // The notes come in one after another, once, when they first arrive.
  const list = useRef<HTMLOListElement>(null)
  useGSAP(
    () => {
      if (!briefing.data) return
      const media = gsap.matchMedia()
      media.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          list.current?.children ?? [],
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.06, clearProps: 'opacity,transform' },
        )
      })
      return () => media.revert()
    },
    { dependencies: [Boolean(briefing.data)], scope: list },
  )

  return (
    <section aria-labelledby="briefing-title" className="flex overflow-hidden rounded-lg border bg-paper">
      <div className="w-1 shrink-0 bg-primary" />
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h3 id="briefing-title" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Today's briefing
          </h3>
          <p className="figures text-xs text-muted-foreground">
            {notes.length > 0 && `${money(String(atRisk))} at risk · ${plural(notes.length, 'note', 'notes')} · `}
            {formatWeekday(today())}
          </p>
        </div>

        {briefing.isError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              {briefing.error.message}
              <Button size="sm" variant="outline" onClick={() => void briefing.refetch()}>Try again</Button>
            </AlertDescription>
          </Alert>
        ) : !briefing.data ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-6 w-full max-w-xl" />
            <Skeleton className="h-6 w-full max-w-lg" />
          </div>
        ) : notes.length === 0 ? (
          <p className="flex items-center gap-2 text-base">
            <CircleCheck className="size-4 text-primary" />
            Nothing needs you today: no expired stock, no shortages ahead and no late deliveries.
          </p>
        ) : (
          <ol ref={list} className="flex flex-col divide-y divide-dashed divide-foreground/15">
            {shown.map((note, index) => {
              const { tag, tone, text, amount, meaning, action } = write(note, money)
              const first = index === 0
              return (
                <li key={`${note.kind}-${note.product?.id ?? note.delivery_id ?? index}`}
                  className="group grid grid-cols-[1fr_auto_auto] items-start gap-x-3 gap-y-1 py-3 first:pt-1 last:pb-0 sm:grid-cols-[6.5rem_1fr_auto_auto] sm:items-center sm:gap-x-4">
                  <span className={`w-fit rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase ${TONES[tone]}`}>
                    {tag}
                  </span>
                  <p className={`col-span-3 row-start-2 leading-snug sm:col-span-1 sm:col-start-2 sm:row-start-1 ${first ? 'text-lg' : 'text-base'}`}>
                    {text}
                  </p>
                  <p className="col-start-2 row-start-1 text-right sm:col-start-3">
                    <span className={`figures block font-medium ${first ? 'text-lg' : 'text-base'}`}>{amount}</span>
                    <span className="block text-xs text-muted-foreground">{meaning}</span>
                  </p>
                  <div className="col-start-3 row-start-1 sm:col-start-4">{action}</div>
                </li>
              )
            })}
          </ol>
        )}

        {(hidden > 0 || canShowFewer) && (
          <Button variant="ghost" size="sm" className="self-start" aria-expanded={showAll}
            onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer' : `Show ${hidden} more`}
          </Button>
        )}
        {briefing.data && notes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Found in your stock, deliveries and sales. Forecast model: {briefing.data.method}.
            The most money involved comes first.
          </p>
        )}
      </div>
    </section>
  )
}
