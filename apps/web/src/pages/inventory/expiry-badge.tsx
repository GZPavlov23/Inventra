import { Badge } from '@/components/ui/badge'
import { daysUntil } from '@/lib/format'
import type { Batch } from '@/lib/inventory-api'

function expiryText(days: number): string {
  if (days < -1) return `Expired ${-days} days ago`
  if (days === -1) return 'Expired yesterday'
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  return `${days} days left`
}

// Only for batches that need attention: fresh goods and goods that don't expire show nothing.
export function ExpiryBadge({ batch }: { batch: Batch }) {
  if (!batch.expiry_date) return null
  if (batch.expiry_status === 'expired') {
    return <Badge variant="destructive">{expiryText(daysUntil(batch.expiry_date))}</Badge>
  }
  if (batch.expiry_status === 'expiring') {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-900">
        {expiryText(daysUntil(batch.expiry_date))}
      </Badge>
    )
  }
  return null
}
