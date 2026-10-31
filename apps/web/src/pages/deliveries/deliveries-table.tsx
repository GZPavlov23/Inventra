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
import type { Delivery } from '@/lib/deliveries-api'
import { daysUntil, formatDateTime, formatDay, formatMoney } from '@/lib/format'

const LINES_SHOWN = 2

function isLate(delivery: Delivery): boolean {
  return delivery.status === 'ordered' && delivery.expected_on !== null && daysUntil(delivery.expected_on) < 0
}

export function DeliveryStatusBadge({ delivery }: { delivery: Delivery }) {
  if (isLate(delivery)) return <Badge variant="destructive">Late</Badge>
  if (delivery.status === 'ordered') return <Badge variant="secondary">On the way</Badge>
  if (delivery.status === 'received') return <Badge>Received</Badge>
  return <Badge variant="outline">Cancelled</Badge>
}

function dateText(delivery: Delivery): string {
  if (delivery.received_at) return formatDateTime(delivery.received_at)
  return delivery.expected_on ? formatDay(delivery.expected_on) : '—'
}

function linesText(delivery: Delivery): string {
  const shown = delivery.items.slice(0, LINES_SHOWN).map((line) => line.product.name)
  const hidden = delivery.items.length - shown.length
  return hidden > 0 ? `${shown.join(', ')} and ${hidden} more` : shown.join(', ')
}

function TableHeadings() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Delivery</TableHead>
        <TableHead>Supplier</TableHead>
        <TableHead>Products</TableHead>
        <TableHead>Date</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Cost</TableHead>
        <TableHead className="w-24"><span className="sr-only">Actions</span></TableHead>
      </TableRow>
    </TableHeader>
  )
}

type DeliveriesTableProps = {
  deliveries: Delivery[]
  currency: string
  onOpen: (delivery: Delivery) => void
  onReceive: (delivery: Delivery) => void
}

export function DeliveriesTable({ deliveries, currency, onOpen, onReceive }: DeliveriesTableProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Deliveries of your store, newest first</TableCaption>
      <TableHeadings />
      <TableBody>
        {deliveries.map((delivery) => (
          <TableRow key={delivery.id} className="cursor-pointer" onClick={() => onOpen(delivery)}>
            <TableCell className="font-medium tabular-nums">
              {/* A real button, so keyboard users can open the row too. */}
              <button type="button" className="cursor-pointer outline-offset-2">#{delivery.id}</button>
            </TableCell>
            <TableCell className="font-medium">{delivery.supplier.name}</TableCell>
            <TableCell className="max-w-xs truncate text-muted-foreground">{linesText(delivery)}</TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{dateText(delivery)}</TableCell>
            <TableCell><DeliveryStatusBadge delivery={delivery} /></TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatMoney(delivery.received_total ?? delivery.ordered_total, currency)}
            </TableCell>
            <TableCell className="py-0 text-right" onClick={(event) => event.stopPropagation()}>
              {delivery.status === 'ordered' && (
                <Button size="sm" variant="outline" aria-label={`Receive delivery #${delivery.id}`}
                  onClick={() => onReceive(delivery)}>
                  Receive
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function DeliveriesTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Table aria-busy="true">
      <TableCaption className="sr-only">Loading deliveries</TableCaption>
      <TableHeadings />
      <TableBody>
        {Array.from({ length: rows }, (_, index) => (
          <TableRow key={index}>
            <TableCell><Skeleton className="h-4 w-8" /></TableCell>
            <TableCell><Skeleton className="h-4 w-36" /></TableCell>
            <TableCell><Skeleton className="h-4 w-44" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
            <TableCell />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
