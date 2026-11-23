import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { useCan, useCurrentUser } from '@/auth/use-auth'
import { Sparkline } from '@/components/sparkline'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import {
  daysUntil,
  formatChange,
  formatDay,
  formatLongDay,
  formatMoney,
  formatMonthDay,
  formatQuantity,
  formatTime,
  marginPercent,
} from '@/lib/format'
import { type ProductUnit, productsApi, type StoryEvent } from '@/lib/products-api'
import { reportsApi } from '@/lib/reports-api'
import { NotFoundPage } from '@/pages/not-found-page'

const TREND_DAYS = 14

const DOTS: Record<StoryEvent['kind'], string> = {
  received: 'bg-foreground',
  sold: 'bg-good',
  written_off: 'bg-destructive',
  corrected: 'bg-signal',
  ordered: 'bg-muted-foreground',
}

const WASTE_REASONS: Record<string, string> = { expired: 'expired', damaged: 'damaged', other: 'another reason' }

// "Today", "Yesterday", or the date written out.
function dayTitle(day: string): string {
  const days = daysUntil(day)
  return days === 0 ? 'Today' : days === -1 ? 'Yesterday' : formatLongDay(day)
}

// One line of the story, in words.
function tell(event: StoryEvent, unit: ProductUnit): ReactNode {
  const amount = formatQuantity(event.quantity, unit)
  const by = event.actor && <span className="text-muted-foreground"> · by {event.actor}</span>
  switch (event.kind) {
    case 'received':
      return (
        <>
          Received <b>{amount}</b>
          {event.supplier && <> from {event.supplier}, delivery #{event.delivery_id}</>}
          {event.expiry_date ? <>, expiring {formatDay(event.expiry_date)}</> : <>, no expiry date</>}
          {event.lot_code && <>, lot {event.lot_code}</>}
          {by}
        </>
      )
    case 'sold':
      return <>Sold <b>{amount}</b> in {event.sales === 1 ? '1 sale' : `${event.sales} sales`}</>
    case 'written_off':
      return <>Wrote off <b>{amount}</b>: {WASTE_REASONS[event.reason ?? 'other'] ?? event.reason}{by}</>
    case 'corrected':
      return <>Count corrected by <b>{formatChange(event.quantity, unit)}</b>: “{event.reason}”{by}</>
    case 'ordered':
      return (
        <>
          Ordered <b>{amount}</b> from {event.supplier}, delivery #{event.delivery_id}
          {event.expected_on && <>, expected {formatDay(event.expected_on)}</>}
          {event.status === 'received' && <Badge variant="secondary" className="ml-2 bg-good/12 text-good">Arrived</Badge>}
          {event.status === 'cancelled' && <Badge variant="secondary" className="ml-2">Cancelled</Badge>}
        </>
      )
  }
}

// Everything that happened to one product in the store, the newest first: the card says where
// it stands now, the story says how it got there.
export function ProductStoryPage() {
  const productId = Number(useParams().productId)
  const { store } = useCurrentUser()
  const can = useCan()
  const money = (amount: string) => formatMoney(amount, store.currency)

  const product = useQuery({
    queryKey: ['products', 'one', productId],
    queryFn: () => productsApi.get(productId),
    enabled: Number.isInteger(productId),
    retry: false,
  })
  // Starts with 'batches', so a sale, a delivery or a write-off elsewhere refreshes it.
  const story = useInfiniteQuery({
    queryKey: ['batches', 'story', productId],
    queryFn: ({ pageParam }) => productsApi.story(productId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.earlier ?? undefined,
    enabled: product.isSuccess,
  })
  const trend = useQuery({
    queryKey: ['sales', 'trend', TREND_DAYS, [productId]],
    queryFn: () => reportsApi.salesTrend([productId], TREND_DAYS),
    enabled: product.isSuccess,
  })

  const missing = product.error instanceof ApiError && product.error.status === 404
  if (!Number.isInteger(productId) || missing) {
    return <NotFoundPage />
  }
  if (product.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{product.error.message}</AlertDescription>
      </Alert>
    )
  }

  const item = product.data
  const attention = story.data?.pages[0].attention
  const days = story.data?.pages.flatMap((page) => page.days) ?? []
  const sold = trend.data?.[0]
  const margin = item && marginPercent(item.purchase_price, item.sale_price)

  return (
    <div className="flex flex-col gap-6">
      <Link to="/products" className="flex w-fit items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Products
      </Link>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Where it stands now" className="flex flex-[1_1_18rem] flex-col gap-4 rounded-3xl bg-card p-6 shadow-soft">
          {!item ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <>
              <div>
                {item.category && <Badge variant="secondary">{item.category}</Badge>}
                <h2 className="mt-2 text-3xl leading-tight font-bold">{item.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.barcode && <span className="font-mono">{item.barcode}</span>}
                  {item.barcode && item.supplier && ' · '}
                  {item.supplier?.name}
                </p>
                {!item.active && <Badge variant="outline" className="mt-2">Archived</Badge>}
              </div>
              <dl className="grid grid-cols-2 gap-4">
                <Fact label="Sale price">{money(item.sale_price)}</Fact>
                <Fact label="Margin">{margin === null || margin === undefined ? '—' : `${margin.toFixed(1)}%`}</Fact>
                <Fact label="On the shelf">{formatQuantity(item.stock, item.unit)}</Fact>
                <Fact label={`Sold, ${TREND_DAYS} days`}>
                  {sold ? formatQuantity(sold.total, item.unit) : '…'}
                </Fact>
              </dl>
              {sold && (
                <Sparkline values={sold.quantities.map(Number)} label={`${formatQuantity(sold.total, item.unit)} sold in the last ${TREND_DAYS} days`} />
              )}
            </>
          )}
        </section>

        <section aria-labelledby="story-title" className="flex flex-[2_1_26rem] flex-col gap-4">
          <h3 id="story-title" className="text-2xl font-bold">Its story, newest first</h3>

          {item && attention && (attention.expired.length > 0 || attention.late.length > 0) && (
            <ul aria-label="Needs doing now" className="flex flex-col gap-2">
              {attention.expired.map((batch) => (
                <li key={batch.batch_id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-destructive/12 px-4 py-3">
                  <p className="figures min-w-0 flex-[1_1_16rem]">
                    <b>{formatQuantity(batch.quantity, item.unit)}</b> expired on {formatMonthDay(batch.expiry_date)} and
                    still count as stock.
                  </p>
                  {can('handle_stock') && (
                    <Button size="sm" variant="secondary" asChild>
                      <Link to={`/inventory?status=expired&q=${encodeURIComponent(item.barcode ?? item.name)}`}>Write off</Link>
                    </Button>
                  )}
                </li>
              ))}
              {attention.late.map((delivery) => (
                <li key={delivery.delivery_id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-warning px-4 py-3 text-warning-foreground">
                  <p className="min-w-0 flex-[1_1_16rem]">
                    Delivery #{delivery.delivery_id} from {delivery.supplier} was due {formatMonthDay(delivery.expected_on)}.
                  </p>
                  {delivery.phone && (
                    <Button size="sm" variant="secondary" asChild>
                      <a href={`tel:${delivery.phone.replace(/\s/g, '')}`}><Phone />Call {delivery.phone}</a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {story.isError ? (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                {story.error.message}
                <Button size="sm" variant="outline" onClick={() => void story.refetch()}>Try again</Button>
              </AlertDescription>
            </Alert>
          ) : !story.data || !item ? (
            <Skeleton className="h-72 w-full rounded-3xl" />
          ) : days.length === 0 ? (
            <p className="rounded-3xl bg-card p-6 text-center text-muted-foreground shadow-soft">
              Nothing has happened to this product yet. Receiving goods starts its story.
            </p>
          ) : (
            <ol aria-label="Story" className="flex flex-col gap-5 border-l-2 border-dashed border-border pl-6">
              {days.map((day) => (
                <li key={day.day} className="relative">
                  <h4 className="font-sans text-sm font-extrabold text-muted-foreground">{dayTitle(day.day)}</h4>
                  <ul className="mt-2 flex flex-col gap-2">
                    {day.events.map((event, index) => (
                      <li key={`${event.kind}-${event.at}-${index}`} className="relative rounded-2xl bg-card px-4 py-3 shadow-soft">
                        <span aria-hidden className={`absolute top-4.5 -left-[2.0625rem] size-3 rounded-full ring-4 ring-background ${DOTS[event.kind]}`} />
                        <p className="figures text-[0.9375rem] leading-relaxed">
                          {event.kind !== 'sold' && (
                            <span className="mr-2 text-xs text-muted-foreground">{formatTime(event.at)}</span>
                          )}
                          {tell(event, item.unit)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}

          {story.hasNextPage && (
            <Button variant="secondary" className="self-start" disabled={story.isFetchingNextPage}
              onClick={() => void story.fetchNextPage()}>
              {story.isFetchingNextPage ? 'Loading…' : 'Show earlier'}
            </Button>
          )}
          {story.data && !story.hasNextPage && days.length > 0 && (
            <p className="font-hand text-2xl text-muted-foreground">that's where it all began</p>
          )}
        </section>
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
      <dd className="figures mt-0.5 font-heading text-2xl font-bold">{children}</dd>
    </div>
  )
}
