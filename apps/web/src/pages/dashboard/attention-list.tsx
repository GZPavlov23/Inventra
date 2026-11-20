import { CircleCheck } from 'lucide-react'
import { Link } from 'react-router'

import { formatQuantity } from '@/lib/format'
import type { Batch } from '@/lib/inventory-api'
import { ExpiryBadge } from '@/pages/inventory/expiry-badge'

export function AttentionList({ batches }: { batches: Batch[] }) {
  if (batches.length === 0) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <CircleCheck className="size-4 text-good" />
        Nothing has expired or is about to.
      </p>
    )
  }

  return (
    <ul aria-label="Batches that need attention" className="flex flex-col divide-y">
      {batches.map((batch) => (
        <li key={batch.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <Link
              to={`/inventory?q=${encodeURIComponent(batch.product.name)}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {batch.product.name}
            </Link>
            <p className="text-xs text-muted-foreground figures">
              {formatQuantity(batch.remaining_quantity, batch.product.unit)}
            </p>
          </div>
          <ExpiryBadge batch={batch} />
        </li>
      ))}
    </ul>
  )
}
