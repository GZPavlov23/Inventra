import { useQuery } from '@tanstack/react-query'
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/skeleton'
import { deliveriesApi } from '@/lib/deliveries-api'
import { daysUntil } from '@/lib/format'
import { inventoryApi } from '@/lib/inventory-api'

// Enough for every delivery a small store has on the way at once.
const OPEN_DELIVERIES = 200

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

// The day in one sentence, each part a link to where it is dealt with. Things that are fine
// are left out, so what is said is always worth reading.
export function TodayLine() {
  const stock = useQuery({ queryKey: ['batches', 'summary'], queryFn: inventoryApi.summary })
  const deliveries = useQuery({
    queryKey: ['deliveries', { status: 'ordered', page: 1 }, OPEN_DELIVERIES],
    queryFn: () => deliveriesApi.list('ordered', OPEN_DELIVERIES, 0),
  })

  if (!stock.data || !deliveries.data) return <Skeleton className="h-7 w-full max-w-xl" />

  const late = deliveries.data.items.filter(
    (delivery) => delivery.expected_on !== null && daysUntil(delivery.expected_on) < 0,
  ).length
  const parts: ReactNode[] = []
  const add = (to: string, text: string, tone = '') =>
    parts.push(<Link key={text} to={to} className={`underline decoration-1 underline-offset-4 hover:decoration-2 ${tone}`}>{text}</Link>)

  if (stock.data.expired_batches > 0) {
    add('/inventory?status=expired', `${plural(stock.data.expired_batches, 'batch has', 'batches have')} expired`, 'text-destructive')
  }
  if (stock.data.expiring_batches > 0) {
    add('/inventory?status=expiring', `${plural(stock.data.expiring_batches, 'batch expires', 'batches expire')} within a week`)
  }
  if (deliveries.data.total > 0) {
    add('/deliveries', `${plural(deliveries.data.total, 'delivery is', 'deliveries are')} on the way`)
  }
  if (late > 0) add('/deliveries', `${late.toLocaleString()} of them late`, 'text-destructive')

  return (
    <p className="max-w-3xl text-lg leading-relaxed text-balance">
      {parts.length === 0
        ? 'Nothing has expired, nothing is about to, and no delivery is waiting.'
        : parts.map((part, index) => (
            <Fragment key={index}>
              {index === 0 ? '' : index === parts.length - 1 ? ' and ' : ', '}
              {part}
            </Fragment>
          ))}
      {parts.length > 0 && '.'}
    </p>
  )
}
