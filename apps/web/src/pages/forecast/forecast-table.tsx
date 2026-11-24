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
import { useT } from '@/i18n/language-context'

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
  const t = useT()
  return (
    <Table>
      <TableCaption className="sr-only">{t.forecast.caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{t.forecast.product}</TableHead>
          {/* On a phone the two less important columns go, so the shortage stays on screen. */}
          <TableHead className="hidden md:table-cell">{t.forecast.byDay}</TableHead>
          <TableHead className="text-right">{t.forecast.expectedSales}</TableHead>
          <TableHead className="hidden text-right md:table-cell">{t.forecast.canBeSold}</TableHead>
          <TableHead className="text-right">{t.forecast.shortage}</TableHead>
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
              <TableCell className="text-right figures">
                {formatExpected(item.total, product.unit)}
              </TableCell>
              <TableCell className="hidden text-right text-muted-foreground figures md:table-cell">
                {formatQuantity(item.stock, product.unit)}
              </TableCell>
              <TableCell className="text-right">
                {short ? (
                  <Badge variant="secondary" className="bg-warning text-warning-foreground">
                    {t.forecast.short(formatShortage(item.shortage, product.unit))}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">{t.forecast.enough}</span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
