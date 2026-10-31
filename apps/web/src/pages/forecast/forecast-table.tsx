import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatExpected, formatQuantity, formatShortage } from '@/lib/format'
import type { ProductForecast } from '@/lib/forecasts-api'

// One small bar per day. Only a shape to glance at: the numbers are in the details.
function DayBars({ days }: { days: ProductForecast['days'] }) {
  const largest = Math.max(...days.map(({ quantity }) => Number(quantity)), 0)
  return (
    <div aria-hidden className="flex h-6 items-end gap-0.5">
      {days.map(({ day, quantity }) => (
        <div
          key={day}
          className="w-1.5 rounded-t-[2px] bg-chart-1"
          style={{ height: `${largest > 0 ? Math.max((Number(quantity) / largest) * 100, 4) : 4}%` }}
        />
      ))}
    </div>
  )
}

type ForecastTableProps = {
  items: ProductForecast[]
  onOpen: (item: ProductForecast) => void
}

export function ForecastTable({ items, onOpen }: ForecastTableProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Expected sales per product, the biggest shortage first</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          {/* On a phone the two less important columns go, so the shortage stays on screen. */}
          <TableHead className="hidden md:table-cell">By day</TableHead>
          <TableHead className="text-right">Expected sales</TableHead>
          <TableHead className="hidden text-right md:table-cell">Can be sold now</TableHead>
          <TableHead className="text-right">Shortage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const { product } = item
          const short = Number(item.shortage) > 0
          return (
            <TableRow key={product.id} className="cursor-pointer" onClick={() => onOpen(item)}>
              <TableCell className="font-medium whitespace-normal">
                {/* A real button, so keyboard users can open the row too. Its click
                    bubbles up to the row's onClick. */}
                <button type="button" className="cursor-pointer text-left outline-offset-2">
                  {product.name}
                </button>
              </TableCell>
              <TableCell className="hidden md:table-cell"><DayBars days={item.days} /></TableCell>
              <TableCell className="text-right tabular-nums">
                {formatExpected(item.total, product.unit)}
              </TableCell>
              <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                {formatQuantity(item.stock, product.unit)}
              </TableCell>
              <TableCell className="text-right">
                {short ? (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-900">
                    {formatShortage(item.shortage, product.unit)} short
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">Enough</span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
