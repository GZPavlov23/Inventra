import { Badge } from '@/components/ui/badge'
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
import { formatMoney, marginPercent } from '@/lib/format'
import type { Product } from '@/lib/products-api'

const UNIT_LABELS = { pcs: 'pcs', kg: 'kg', l: 'l' } as const

function TableHeadings() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Category</TableHead>
        <TableHead>Barcode</TableHead>
        <TableHead>Unit</TableHead>
        <TableHead className="text-right">Purchase price</TableHead>
        <TableHead className="text-right">Sale price</TableHead>
        <TableHead className="text-right">Margin</TableHead>
      </TableRow>
    </TableHeader>
  )
}

export function ProductsTable({ products, currency }: { products: Product[]; currency: string }) {
  return (
    <Table>
      <TableCaption className="sr-only">Products of your store</TableCaption>
      <TableHeadings />
      <TableBody>
        {products.map((product) => {
          const margin = marginPercent(product.purchase_price, product.sale_price)
          return (
            <TableRow key={product.id}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium">
                  {product.name}
                  {!product.active && <Badge variant="outline">Archived</Badge>}
                </div>
                {product.brand && <div className="text-xs text-muted-foreground">{product.brand}</div>}
              </TableCell>
              <TableCell>
                {product.category ? <Badge variant="secondary">{product.category}</Badge> : <Dash />}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {product.barcode ?? <Dash />}
              </TableCell>
              <TableCell className="text-muted-foreground">{UNIT_LABELS[product.unit]}</TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {formatMoney(product.purchase_price, currency)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatMoney(product.sale_price, currency)}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${margin !== null && margin < 0 ? 'text-destructive' : ''}`}
              >
                {margin === null ? <Dash /> : `${margin.toFixed(1)}%`}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// Grey placeholder rows with the table's real layout, shown while the first page loads.
export function ProductsTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Table aria-busy="true">
      <TableCaption className="sr-only">Loading products</TableCaption>
      <TableHeadings />
      <TableBody>
        {Array.from({ length: rows }, (_, index) => (
          <TableRow key={index}>
            <TableCell><Skeleton className="h-4 w-44" /></TableCell>
            <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
            <TableCell><Skeleton className="h-4 w-8" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-12" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Dash() {
  return <span className="text-muted-foreground">—</span>
}
