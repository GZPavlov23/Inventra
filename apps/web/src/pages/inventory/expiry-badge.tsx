import { Badge } from '@/components/ui/badge'
import { daysUntil } from '@/lib/format'
import type { Batch } from '@/lib/inventory-api'
import type { Messages } from '@/i18n/en'
import { useT } from '@/i18n/language-context'

function expiryText(days: number, t: Messages): string {
  if (days < -1) return t.inventory.expiredAgo(-days)
  if (days === -1) return t.inventory.expiredYesterday
  if (days === 0) return t.inventory.expiresToday
  if (days === 1) return t.inventory.expiresTomorrow
  return t.inventory.daysLeft(days)
}

// Only for batches that need attention: fresh goods and goods that don't expire show nothing.
export function ExpiryBadge({ batch }: { batch: Batch }) {
  const t = useT()
  if (!batch.expiry_date) return null
  if (batch.expiry_status === 'expired') {
    return <Badge variant="destructive">{expiryText(daysUntil(batch.expiry_date), t)}</Badge>
  }
  if (batch.expiry_status === 'expiring') {
    return (
      <Badge variant="secondary" className="bg-warning text-warning-foreground">
        {expiryText(daysUntil(batch.expiry_date), t)}
      </Badge>
    )
  }
  return null
}
