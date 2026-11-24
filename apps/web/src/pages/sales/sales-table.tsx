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
import type { Messages } from '@/i18n/en'
import { useT } from '@/i18n/language-context'

const LINES_SHOWN = 2

function TableHeadings() {
  const t = useT()
  return (
    <TableHeader>
      <TableRow>
        <TableHead>{t.sales.time}</TableHead>
        <TableHead>{t.sales.products}</TableHead>
        <TableHead>{t.sales.soldBy}</TableHead>
        <TableHead className="text-right">{t.sales.total}</TableHead>
        <TableHead className="text-right">{t.sales.profit}</TableHead>
      </TableRow>
    </TableHeader>
  )
}

function linesText(sale: Sale, t: Messages): string {
  const shown = sale.items
    .slice(0, LINES_SHOWN)
    .map(({ product, quantity }) => `${product.name} × ${formatQuantity(quantity, product.unit)}`)
  const hidden = sale.items.length - shown.length
  return hidden > 0 ? t.sales.andMore(shown.join(', '), hidden) : shown.join(', ')
}

type SalesTableProps = {
  sales: Sale[]
  currency: string
  onOpen: (sale: Sale) => void
}

export function SalesTable({ sales, currency, onOpen }: SalesTableProps) {
  const t = useT()
  return (
    <Table>
      <TableCaption className="sr-only">{t.sales.caption}</TableCaption>
      <TableHeadings />
      <TableBody>
        {sales.map((sale) => (
          <TableRow key={sale.id} className="cursor-pointer" onClick={() => onOpen(sale)}>
            <TableCell className="text-muted-foreground figures">
              {/* A real button, so keyboard users can open the row too. Its click
                  bubbles up to the row's onClick. */}
              <button type="button" className="cursor-pointer text-left outline-offset-2">
                {formatDateTime(sale.sold_at)}
              </button>
            </TableCell>
            <TableCell className="max-w-md truncate font-medium">{linesText(sale, t)}</TableCell>
            <TableCell className="text-muted-foreground">{sale.actor.full_name}</TableCell>
            <TableCell className="text-right font-medium figures">
              {formatMoney(sale.total, currency)}
            </TableCell>
            <TableCell
              className={`text-right figures ${Number(sale.profit) < 0 ? 'text-destructive' : ''}`}
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
  const t = useT()
  return (
    <Table aria-busy="true">
      <TableCaption className="sr-only">{t.sales.loading}</TableCaption>
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
