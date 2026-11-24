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
import type { Messages } from '@/i18n/en'
import { useT } from '@/i18n/language-context'

const LINES_SHOWN = 2

function isLate(delivery: Delivery): boolean {
  return delivery.status === 'ordered' && delivery.expected_on !== null && daysUntil(delivery.expected_on) < 0
}

export function DeliveryStatusBadge({ delivery }: { delivery: Delivery }) {
  const t = useT()
  if (isLate(delivery)) return <Badge variant="destructive">{t.deliveries.late}</Badge>
  if (delivery.status === 'ordered') return <Badge variant="secondary">{t.deliveries.statuses.ordered}</Badge>
  if (delivery.status === 'received') return <Badge>{t.deliveries.statuses.received}</Badge>
  return <Badge variant="outline">{t.deliveries.statuses.cancelled}</Badge>
}

function dateText(delivery: Delivery): string {
  if (delivery.received_at) return formatDateTime(delivery.received_at)
  return delivery.expected_on ? formatDay(delivery.expected_on) : '—'
}

function linesText(delivery: Delivery, t: Messages): string {
  const shown = delivery.items.slice(0, LINES_SHOWN).map((line) => line.product.name)
  const hidden = delivery.items.length - shown.length
  return hidden > 0 ? t.deliveries.andMore(shown.join(', '), hidden) : shown.join(', ')
}

function TableHeadings() {
  const t = useT()
  return (
    <TableHeader>
      <TableRow>
        <TableHead>{t.deliveries.delivery}</TableHead>
        <TableHead>{t.deliveries.supplier}</TableHead>
        <TableHead>{t.deliveries.products}</TableHead>
        <TableHead>{t.deliveries.date}</TableHead>
        <TableHead>{t.deliveries.status}</TableHead>
        <TableHead className="text-right">{t.deliveries.cost}</TableHead>
        <TableHead className="w-24"><span className="sr-only">{t.inventory.actions}</span></TableHead>
      </TableRow>
    </TableHeader>
  )
}

type DeliveriesTableProps = {
  deliveries: Delivery[]
  currency: string
  onOpen: (delivery: Delivery) => void
  onReceive: (delivery: Delivery) => void
  justAdded?: number
}

export function DeliveriesTable({ deliveries, currency, onOpen, onReceive, justAdded }: DeliveriesTableProps) {
  const t = useT()
  return (
    <Table>
      <TableCaption className="sr-only">{t.deliveries.caption}</TableCaption>
      <TableHeadings />
      <TableBody>
        {deliveries.map((delivery) => (
          <TableRow key={delivery.id} className="cursor-pointer" data-new={delivery.id === justAdded}
            onClick={() => onOpen(delivery)}>
            <TableCell className="font-medium figures">
              {/* A real button, so keyboard users can open the row too. */}
              <button type="button" className="cursor-pointer outline-offset-2">#{delivery.id}</button>
            </TableCell>
            <TableCell className="font-medium">{delivery.supplier.name}</TableCell>
            <TableCell className="max-w-xs truncate text-muted-foreground">{linesText(delivery, t)}</TableCell>
            <TableCell className="text-muted-foreground figures">{dateText(delivery)}</TableCell>
            <TableCell><DeliveryStatusBadge delivery={delivery} /></TableCell>
            <TableCell className="text-right font-medium figures">
              {formatMoney(delivery.received_total ?? delivery.ordered_total, currency)}
            </TableCell>
            <TableCell className="py-0 text-right" onClick={(event) => event.stopPropagation()}>
              {delivery.status === 'ordered' && (
                <Button size="sm" variant="outline" aria-label={t.deliveries.receiveNumber(delivery.id)}
                  onClick={() => onReceive(delivery)}>
                  {t.deliveries.receive}
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
  const t = useT()
  return (
    <Table aria-busy="true">
      <TableCaption className="sr-only">{t.deliveries.loading}</TableCaption>
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
