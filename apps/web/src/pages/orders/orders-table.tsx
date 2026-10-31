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

// The sum behind the number, so nobody has to trust a quantity they can't follow.
function explanation(line: OrderLine): string {
  const { unit } = line.product
  const stock = Number(line.from_stock) + Number(line.left_over)
  const sum = `Expected ${formatExpected(line.expected, unit)}, plus a buffer of ${formatExpected(line.buffer, unit)}, minus ${formatExpected(stock, unit)} of usable stock`
  return Number(line.on_the_way) > 0 ? `${sum} and ${formatExpected(line.on_the_way, unit)} on the way` : sum
}

type OrdersTableProps = {
  lines: OrderLine[]
  quantities: Record<number, string>
  currency: string
  onChange: (productId: number, quantity: string) => void
}

export function OrdersTable({ lines, quantities, currency, onChange }: OrdersTableProps) {
  return (
    <Table>
      <TableCaption className="sr-only">What to order, the most expensive first</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead className="w-32">Order</TableHead>
          <TableHead className="w-24 text-right">Cost</TableHead>
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
                  {line.supplier?.name ?? 'No supplier'}
                </p>
                <p className="text-xs text-muted-foreground">{explanation(line)}</p>
                {Number(line.expiring_unsold) > 0 && (
                  <p className="text-xs text-amber-900">
                    {formatExpected(line.expiring_unsold, product.unit)} of your stock will expire before it sells
                  </p>
                )}
                {edited && (
                  <p className="text-xs text-muted-foreground">
                    Recommended: {formatQuantity(line.order, product.unit)}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Input type="number" inputMode="decimal" min="0"
                    step={product.unit === 'pcs' ? '1' : '0.1'}
                    aria-label={`Order of ${product.name}`}
                    value={quantity} onChange={(event) => onChange(product.id, event.target.value)} />
                  <span className="text-xs text-muted-foreground">{product.unit}</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatMoney(lineCents(quantity, line.unit_cost) / 100, currency)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
