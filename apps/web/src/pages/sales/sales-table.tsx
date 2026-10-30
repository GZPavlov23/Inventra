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
import { formatDateTime, formatMoney, formatQuantity } from '@/lib/format'
import type { Sale } from '@/lib/sales-api'

const LINES_SHOWN = 2

function TableHeadings() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Time</TableHead>
        <TableHead>Products</TableHead>
        <TableHead>Sold by</TableHead>
        <TableHead className="text-right">Total</TableHead>
        <TableHead className="text-right">Profit</TableHead>
      </TableRow>
    </TableHeader>
  )
}

function linesText(sale: Sale): string {
  const shown = sale.items
    .slice(0, LINES_SHOWN)
    .map(({ product, quantity }) => `${product.name} × ${formatQuantity(quantity, product.unit)}`)
  const hidden = sale.items.length - shown.length
  return hidden > 0 ? `${shown.join(', ')} and ${hidden} more` : shown.join(', ')
}

type SalesTableProps = {
  sales: Sale[]
  currency: string
  onOpen: (sale: Sale) => void
}

export function SalesTable({ sales, currency, onOpen }: SalesTableProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Sales of the chosen period, newest first</TableCaption>
      <TableHeadings />
      <TableBody>
        {sales.map((sale) => (
          <TableRow key={sale.id} className="cursor-pointer" onClick={() => onOpen(sale)}>
            <TableCell className="text-muted-foreground tabular-nums">
              {/* A real button, so keyboard users can open the row too. Its click
                  bubbles up to the row's onClick. */}
              <button type="button" className="cursor-pointer text-left outline-offset-2">
                {formatDateTime(sale.sold_at)}
              </button>
            </TableCell>
            <TableCell className="max-w-md truncate font-medium">{linesText(sale)}</TableCell>
            <TableCell className="text-muted-foreground">{sale.actor.full_name}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatMoney(sale.total, currency)}
            </TableCell>
            <TableCell
              className={`text-right tabular-nums ${Number(sale.profit) < 0 ? 'text-destructive' : ''}`}
            >
              {formatMoney(sale.profit, currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// Grey placeholder rows with the table's real layout, shown while the first page loads.
export function SalesTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Table aria-busy="true">
      <TableCaption className="sr-only">Loading sales</TableCaption>
      <TableHeadings />
      <TableBody>
        {Array.from({ length: rows }, (_, index) => (
          <TableRow key={index}>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-56" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
