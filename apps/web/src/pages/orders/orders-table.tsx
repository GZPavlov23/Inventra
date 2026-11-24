import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatExpected, formatMoney, formatQuantity, lineCents } from '@/lib/format'
import { type OrderLine, recommendedQuantity } from '@/lib/forecasts-api'
import type { Messages } from '@/i18n/en'
import { useT } from '@/i18n/language-context'

// The sum behind the number, so nobody has to trust a quantity they can't follow.
function explanation(line: OrderLine, t: Messages): string {
  const { unit } = line.product
  const stock = Number(line.from_stock) + Number(line.left_over)
  const sum = t.orders.explanation(formatExpected(line.expected, unit), formatExpected(line.buffer, unit), formatExpected(stock, unit))
  return Number(line.on_the_way) > 0 ? t.orders.onTheWay(sum, formatExpected(line.on_the_way, unit)) : sum
}

type OrdersTableProps = {
  lines: OrderLine[]
  quantities: Record<number, string>
  currency: string
  onChange: (productId: number, quantity: string) => void
}

export function OrdersTable({ lines, quantities, currency, onChange }: OrdersTableProps) {
  const t = useT()
  return (
    <Table>
      <TableCaption className="sr-only">{t.orders.caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{t.orders.product}</TableHead>
          <TableHead className="w-32">{t.orders.order}</TableHead>
          <TableHead className="w-24 text-right">{t.orders.cost}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => {
          const { product } = line
          const quantity = quantities[product.id] ?? recommendedQuantity(line)
          const edited = Number(quantity) !== Number(line.order)
          return (
            <TableRow key={product.id}>
              <TableCell className="whitespace-normal">
                <p className="font-medium">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {line.supplier?.name ?? t.orders.noSupplier}
                </p>
                <p className="text-xs text-muted-foreground">{explanation(line, t)}</p>
                {Number(line.expiring_unsold) > 0 && (
                  <p className="text-xs text-warning-foreground">
                    {t.orders.willExpire(formatExpected(line.expiring_unsold, product.unit))}
                  </p>
                )}
                {edited && (
                  <p className="text-xs text-muted-foreground">
                    {t.orders.recommended(formatQuantity(line.order, product.unit))}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Input type="number" inputMode="decimal" min="0"
                    step={product.unit === 'pcs' ? '1' : '0.1'}
                    aria-label={t.orders.orderOf(product.name)}
                    value={quantity} onChange={(event) => onChange(product.id, event.target.value)} />
                  <span className="text-xs text-muted-foreground">{t.units[product.unit]}</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-medium figures">
                {formatMoney(lineCents(quantity, line.unit_cost) / 100, currency)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
