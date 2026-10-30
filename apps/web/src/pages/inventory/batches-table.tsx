import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { daysUntil, formatDay, formatMoney, formatQuantity } from '@/lib/format'
import type { Batch } from '@/lib/inventory-api'

function TableHeadings() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Product</TableHead>
        <TableHead>Lot</TableHead>
        <TableHead>Expires</TableHead>
        <TableHead className="text-right">Remaining</TableHead>
        <TableHead className="text-right">Purchase price</TableHead>
        <TableHead className="w-24"><span className="sr-only">Actions</span></TableHead>
      </TableRow>
    </TableHeader>
  )
}

function expiryText(days: number): string {
  if (days < -1) return `Expired ${-days} days ago`
  if (days === -1) return 'Expired yesterday'
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  return `${days} days left`
}

function ExpiryCell({ batch }: { batch: Batch }) {
  if (!batch.expiry_date) return <Dash />
  const { expiry_status: status } = batch
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="tabular-nums">{formatDay(batch.expiry_date)}</span>
      {status === 'expired' && (
        <Badge variant="destructive">{expiryText(daysUntil(batch.expiry_date))}</Badge>
      )}
      {status === 'expiring' && (
        <Badge variant="secondary" className="bg-amber-100 text-amber-900">
          {expiryText(daysUntil(batch.expiry_date))}
        </Badge>
      )}
    </div>
  )
}

type BatchesTableProps = {
  batches: Batch[]
  currency: string
  onWriteOff: (batch: Batch) => void
}

export function BatchesTable({ batches, currency, onWriteOff }: BatchesTableProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Batches of your store, the earliest expiry date first</TableCaption>
      <TableHeadings />
      <TableBody>
        {batches.map((batch) => {
          const { product } = batch
          const used = Number(batch.remaining_quantity) === 0
          return (
            <TableRow key={batch.id}>
              <TableCell>
                <div className="font-medium">{product.name}</div>
                {product.barcode && (
                  <div className="font-mono text-xs text-muted-foreground">{product.barcode}</div>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{batch.lot_code ?? <Dash />}</TableCell>
              <TableCell><ExpiryCell batch={batch} /></TableCell>
              <TableCell className="text-right tabular-nums">
                <span className={used ? 'text-muted-foreground' : 'font-medium'}>
                  {formatQuantity(batch.remaining_quantity, product.unit)}
                </span>
                <div className="text-xs text-muted-foreground">
                  of {formatQuantity(batch.received_quantity, product.unit)}
                </div>
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {formatMoney(batch.purchase_price, currency)}
              </TableCell>
              <TableCell className="py-0 text-right">
                {!used && (
                  <Button variant="outline" size="sm" aria-label={`Write off ${product.name}`}
                    onClick={() => onWriteOff(batch)}>
                    Write off
                  </Button>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// Grey placeholder rows with the table's real layout, shown while the first page loads.
export function BatchesTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Table aria-busy="true">
      <TableCaption className="sr-only">Loading batches</TableCaption>
      <TableHeadings />
      <TableBody>
        {Array.from({ length: rows }, (_, index) => (
          <TableRow key={index}>
            <TableCell><Skeleton className="h-4 w-44" /></TableCell>
            <TableCell><Skeleton className="h-4 w-14" /></TableCell>
            <TableCell><Skeleton className="h-4 w-36" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-8 w-20" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Dash() {
  return <span className="text-muted-foreground">—</span>
}
