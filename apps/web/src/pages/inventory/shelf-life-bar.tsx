import { daysUntil } from '@/lib/format'
import type { Batch } from '@/lib/inventory-api'

// Two weeks or more fill the bar. One scale for every product, so a short bar always means soon.
const FULL_BAR_DAYS = 14

const COLORS = {
  fresh: 'bg-good',
  expiring: 'bg-signal',
  expired: 'bg-destructive',
  none: '',
} as const

// How long a batch can still be sold, for scanning a long list. The date and the badge next
// to it say the same in words.
export function ShelfLifeBar({ batch }: { batch: Batch }) {
  if (!batch.expiry_date) return null
  const days = daysUntil(batch.expiry_date)
  const expired = batch.expiry_status === 'expired'
  // The last day still counts: goods expiring today get a sliver, not an empty bar.
  const share = expired ? 1 : Math.min((days + 1) / (FULL_BAR_DAYS + 1), 1)

  return (
    <div
      role="img"
      aria-label={expired ? 'Expired' : `${days + 1} of ${FULL_BAR_DAYS + 1} days or more left`}
      className="h-1 w-20 overflow-hidden rounded-full bg-muted"
    >
      <div className={`h-full rounded-full ${COLORS[batch.expiry_status]}`} style={{ width: `${share * 100}%` }} />
    </div>
  )
}
