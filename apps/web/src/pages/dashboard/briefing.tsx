import { useGSAP } from '@gsap/react'
import { useQuery } from '@tanstack/react-query'
import gsap from 'gsap'
import { ArrowRight, Phone } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { Link } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { CaughtUpDrawing } from '@/components/drawings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { daysUntil, formatDay, formatDayOfWeek, formatExpected, formatMoney, today } from '@/lib/format'
import { type BriefingNote, reportsApi } from '@/lib/reports-api'
import type { Messages } from '@/i18n/en'
import { useT } from '@/i18n/language-context'
import { sentence } from '@/i18n/sentence'
import { toApiError } from '@/lib/api'

// Read in passing, so a few at first; the rest are one click away.
const SHOWN_AT_FIRST = 5
// Someone else may sell or receive goods while the dashboard stays open on the counter.
const REFRESH_EVERY_MS = 60_000

// "today", "tomorrow", "on Friday" within a week, a date further away, in the chosen language.
function when(day: string, t: Messages): string {
  const days = daysUntil(day)
  if (days === 0) return t.briefing.today
  if (days === 1) return t.briefing.tomorrow
  if (days > 1 && days < 7) return t.briefing.onWeekday(formatDayOfWeek(day))
  return t.briefing.onDate(formatDay(day))
}

// Colour says what kind of thing it is, the same everywhere in the app: tomato is a loss that
// already happened or a promise broken, mustard is a loss coming, green is good news.
const TONES = {
  loss: 'bg-destructive/12 text-destructive',
  soon: 'bg-warning text-warning-foreground',
  good: 'bg-good/12 text-good',
} as const

// The round badge in front of a note: the first letters of what it is about, like a contact.
function badgeLetters(note: BriefingNote): string {
  const name = note.product?.name ?? note.supplier?.name
  if (!name) return '!'
  const words = name.split(/\s+/).filter((word) => /^\p{L}/u.test(word))
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '!'
}

// A soft pill with a word on it: the friendlier the action, the more likely it gets done.
const ACTION = 'bg-secondary text-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_8%)]'

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
function write(note: BriefingNote, money: (amount: string) => string, t: Messages): Written {
  const product = note.product && <strong className="font-medium">{note.product.name}</strong>
  const quantity = (value: string) => (note.product ? formatExpected(value, note.product.unit) : value)
  const go = (to: string, label: string) => (
    <Button size="sm" className={ACTION} asChild>
      <Link to={to}>{label}<ArrowRight /></Link>
    </Button>
  )

  switch (note.kind) {
    case 'expired':
      return {
        tag: t.briefing.tags.expired,
        tone: 'loss',
        text: t.briefing.expired(note.batches ?? 0),
        amount: money(note.at_stake),
        meaning: t.briefing.meanings.toWriteOff,
        action: go('/inventory?status=expired', t.briefing.actions.writeOff),
      }
    case 'late_delivery': {
      const late = -daysUntil(note.day ?? today())
      return {
        tag: t.briefing.tags.late,
        tone: 'loss',
        text: sentence(t.briefing.late(
          <strong className="font-medium">{note.supplier?.name}</strong>, late, note.deliveries, note.delivery_id,
        )),
        amount: money(note.at_stake),
        meaning: t.briefing.meanings.ordered,
        action: note.supplier?.phone ? (
          <Button size="sm" className="bg-destructive text-primary-foreground hover:bg-destructive/90" asChild>
            <a href={`tel:${note.supplier.phone}`}><Phone />{t.briefing.actions.call(note.supplier.phone)}</a>
          </Button>
        ) : go('/deliveries', t.briefing.actions.open),
      }
    }
    case 'runs_out':
      return {
        tag: t.briefing.tags.runsOut,
        tone: 'soon',
        text: sentence(t.briefing.runsOut(
          product, when(note.day ?? today(), t), note.delivery_day ? when(note.delivery_day, t) : null,
        )),
        amount: `~${money(note.at_stake)}`,
        meaning: t.briefing.meanings.missedSales,
        action: go('/orders', t.briefing.actions.order),
      }
    case 'expires_unsold':
      return {
        tag: t.briefing.tags.willExpire,
        tone: 'soon',
        text: sentence(t.briefing.expiresUnsold(quantity(note.quantity ?? '0'), product, when(note.day ?? today(), t))),
        amount: money(note.at_stake),
        meaning: t.briefing.meanings.atPurchasePrice,
        action: go(`/inventory?q=${encodeURIComponent(note.product?.name ?? '')}`, t.briefing.actions.seeBatches),
      }
    case 'above_forecast': {
      const sold = Number(note.quantity)
      const expected = Number(note.expected)
      const more = expected > 0 ? Math.round(((sold - expected) / expected) * 100) : 0
      return {
        tag: t.briefing.tags.sellingFast,
        tone: 'good',
        text: sentence(t.briefing.aboveForecast(product, quantity(note.quantity ?? '0'), more, quantity(note.expected ?? '0'))),
        amount: money(note.at_stake),
        meaning: t.briefing.meanings.moreSales,
        action: go('/forecast', t.briefing.actions.forecast),
      }
    }
  }
}

export function TodaysBriefing() {
  const { store } = useCurrentUser()
  const t = useT()
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
    <section aria-label={t.briefing.regionLabel} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-2xl font-bold">{t.briefing.title}</h3>
        {notes.length > 0 && (
          <p className="figures text-sm text-muted-foreground">
            {t.briefing.atRisk(money(String(atRisk)), notes.length)}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
        {briefing.isError ? (
          <Alert variant="destructive" className="m-4 w-auto">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              {toApiError(briefing.error).message}
              <Button size="sm" variant="outline" onClick={() => void briefing.refetch()}>{t.common.tryAgain}</Button>
            </AlertDescription>
          </Alert>
        ) : !briefing.data ? (
          <div className="flex flex-col gap-3 p-5" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : notes.length === 0 ? (
          // No notes means every check came back clean, so each of these sentences is true.
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <CaughtUpDrawing className="h-28 text-foreground" />
            <p className="mt-2 font-hand text-4xl text-good">{t.briefing.caughtUp}</p>
            <p className="max-w-lg text-[1.0625rem] leading-relaxed">{t.briefing.caughtUpText}</p>
            <p className="text-sm text-muted-foreground">{t.briefing.checkedAgain}</p>
            <Button variant="link" asChild className="mt-1 font-bold text-good">
              <Link to="/inventory?status=expiring">{t.briefing.seeExpiring}</Link>
            </Button>
          </div>
        ) : (
          <ol ref={list} className="flex flex-col divide-y divide-border/70">
            {shown.map((note, index) => {
              const { tag, tone, text, amount, meaning, action } = write(note, money, t)
              return (
                <li key={`${note.kind}-${note.product?.id ?? note.delivery_id ?? index}`}
                  className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <span aria-hidden="true"
                    className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${TONES[tone]}`}>
                    {badgeLetters(note)}
                  </span>
                  <div className="min-w-0 flex-[1_1_16rem]">
                    <p className="text-[1.0625rem] leading-snug">{text}</p>
                    <p className="figures mt-0.5 text-sm text-muted-foreground">
                      <span className="font-bold">{tag}</span> · {amount} {meaning}
                    </p>
                  </div>
                  <div className="ml-auto">{action}</div>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {(hidden > 0 || canShowFewer) ? (
          <Button variant="ghost" size="sm" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            {showAll ? t.briefing.showFewer : t.briefing.showMore(hidden)}
          </Button>
        ) : <span />}
        {briefing.data && notes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t.briefing.footer(t.common.models[briefing.data.method] ?? briefing.data.method)}
          </p>
        )}
      </div>
    </section>
  )
}
