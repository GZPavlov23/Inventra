import { ClipboardCheck, Ellipsis, History, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { formatDay, formatMoney, formatQuantity } from '@/lib/format'
import type { Batch } from '@/lib/inventory-api'
import { ExpiryBadge } from '@/pages/inventory/expiry-badge'
import { ShelfLifeBar } from '@/pages/inventory/shelf-life-bar'
import { useT } from '@/i18n/language-context'

export type BatchAction = 'write-off' | 'correct' | 'history'

function TableHeadings() {
  const t = useT()
  return (
    <TableHeader>
      <TableRow>
        <TableHead>{t.inventory.product}</TableHead>
        <TableHead>{t.inventory.lot}</TableHead>
        <TableHead>{t.inventory.expires}</TableHead>
        <TableHead className="text-right">{t.inventory.remaining}</TableHead>
        <TableHead className="text-right">{t.inventory.purchasePrice}</TableHead>
        <TableHead className="w-10"><span className="sr-only">{t.inventory.actions}</span></TableHead>
      </TableRow>
    </TableHeader>
  )
}

function ExpiryCell({ batch }: { batch: Batch }) {
  if (!batch.expiry_date) return <Dash />
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="figures">{formatDay(batch.expiry_date)}</span>
        <ExpiryBadge batch={batch} />
      </div>
      <ShelfLifeBar batch={batch} />
    </div>
  )
}

type BatchesTableProps = {
  batches: Batch[]
  currency: string
  onAction: (action: BatchAction, batch: Batch) => void
  // The batch that was just received, so it can be pointed out.
  justAdded?: number
}

export function BatchesTable({ batches, currency, onAction, justAdded }: BatchesTableProps) {
  const t = useT()
  return (
    <Table>
      <TableCaption className="sr-only">{t.inventory.caption}</TableCaption>
      <TableHeadings />
      <TableBody>
        {batches.map((batch) => {
          const { product } = batch
          const used = Number(batch.remaining_quantity) === 0
          return (
            <TableRow key={batch.id} data-new={batch.id === justAdded}>
              <TableCell>
                <div className="font-medium">{product.name}</div>
                {product.barcode && (
                  <div className="font-mono text-xs text-muted-foreground">{product.barcode}</div>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{batch.lot_code ?? <Dash />}</TableCell>
              <TableCell><ExpiryCell batch={batch} /></TableCell>
              <TableCell className="text-right figures">
                <span className={used ? 'text-muted-foreground' : 'font-medium'}>
                  {formatQuantity(batch.remaining_quantity, product.unit)}
                </span>
                <div className="text-xs text-muted-foreground">
                  {t.inventory.of(formatQuantity(batch.received_quantity, product.unit))}
                </div>
              </TableCell>
              <TableCell className="text-right text-muted-foreground figures">
                {formatMoney(batch.purchase_price, currency)}
              </TableCell>
              <TableCell className="py-0 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={t.inventory.actionsFor(product.name)}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!used && (
                      <DropdownMenuItem onSelect={() => onAction('write-off', batch)}>
                        <Trash2 />
                        {t.inventory.writeOff}
                      </DropdownMenuItem>
                    )}
                    {/* Also for empty batches: goods can turn up after everything was written off. */}
                    <DropdownMenuItem onSelect={() => onAction('correct', batch)}>
                      <ClipboardCheck />
                      {t.inventory.correct}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onAction('history', batch)}>
                      <History />
                      {t.inventory.history}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
  const t = useT()
  return (
    <Table aria-busy="true">
      <TableCaption className="sr-only">{t.inventory.loadingBatches}</TableCaption>
      <TableHeadings />
      <TableBody>
        {Array.from({ length: rows }, (_, index) => (
          <TableRow key={index}>
            <TableCell><Skeleton className="h-4 w-44" /></TableCell>
            <TableCell><Skeleton className="h-4 w-14" /></TableCell>
            <TableCell><Skeleton className="h-4 w-36" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
            <TableCell />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Dash() {
  return <span className="text-muted-foreground">—</span>
}
