import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronsUpDown, Ellipsis, Pencil } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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
import { Sparkline } from '@/components/sparkline'
import { formatExpected, formatMoney, formatQuantity, marginPercent } from '@/lib/format'
import type { Product, ProductSort, SortOrder } from '@/lib/products-api'
import type { SalesTrend } from '@/lib/reports-api'

export type SortState = {
  sort: ProductSort
  order: SortOrder
  onSort: (column: ProductSort) => void
}

function SortableHead({ column, label, numeric, sorting }: {
  column: ProductSort
  label: string
  numeric?: boolean
  sorting?: SortState
}) {
  const align = numeric ? 'text-right' : ''
  if (!sorting) return <TableHead className={align}>{label}</TableHead>

  const active = sorting.sort === column
  const Icon = !active ? ChevronsUpDown : sorting.order === 'asc' ? ArrowUp : ArrowDown
  return (
    // aria-sort tells screen readers how the table is currently sorted.
    <TableHead
      className={align}
      aria-sort={active ? (sorting.order === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        onClick={() => sorting.onSort(column)}
        className={`inline-flex cursor-pointer items-center gap-1 tracking-wide uppercase outline-offset-2 hover:text-foreground ${
          numeric ? 'flex-row-reverse' : ''
        }`}
      >
        {label}
        <Icon className={`size-3.5 ${active ? '' : 'text-muted-foreground/60'}`} />
      </button>
    </TableHead>
  )
}

function TableHeadings({ sorting }: { sorting?: SortState }) {
  return (
    <TableHeader>
      <TableRow>
        <SortableHead column="name" label="Name" sorting={sorting} />
        <SortableHead column="category" label="Category" sorting={sorting} />
        <SortableHead column="purchase_price" label="Purchase price" numeric sorting={sorting} />
        <SortableHead column="sale_price" label="Sale price" numeric sorting={sorting} />
        <SortableHead column="margin" label="Margin" numeric sorting={sorting} />
        <SortableHead column="stock" label="Stock" numeric sorting={sorting} />
        <TableHead className="text-right">Last 14 days</TableHead>
        <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
      </TableRow>
    </TableHeader>
  )
}

type ProductsTableProps = {
  products: Product[]
  currency: string
  // Left out for roles that can't change it: the table is then only for looking things up.
  actions?: {
    onEdit: (product: Product) => void
    onSetActive: (product: Product, active: boolean) => void
  }
  sorting: SortState
  justSaved?: number
  // Missing while it loads: the column then stays empty instead of showing zeros.
  trends?: Map<number, SalesTrend>
}

export function ProductsTable({
  products, currency, actions, sorting, justSaved, trends,
}: ProductsTableProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Products of your store</TableCaption>
      <TableHeadings sorting={sorting} />
      <TableBody>
        {products.map((product) => {
          const margin = marginPercent(product.purchase_price, product.sale_price)
          return (
            <TableRow key={product.id} className={actions && 'cursor-pointer'} data-new={product.id === justSaved}
              onClick={actions && (() => actions.onEdit(product))}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium">
                  {/* A real button, so keyboard users can open the row too. Its click
                      bubbles up to the row's onClick. */}
                  {actions ? (
                    <button type="button" className="cursor-pointer text-left outline-offset-2">
                      {product.name}
                    </button>
                  ) : product.name}
                  {!product.active && <Badge variant="outline">Archived</Badge>}
                </div>
                {(product.brand || product.barcode) && (
                  <div className="text-xs text-muted-foreground">
                    {product.brand}
                    {product.brand && product.barcode && ' · '}
                    {product.barcode && <span className="figures">{product.barcode}</span>}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {product.category ? <Badge variant="secondary">{product.category}</Badge> : <Dash />}
              </TableCell>
              <TableCell className="text-right text-muted-foreground figures">
                {formatMoney(product.purchase_price, currency)}
              </TableCell>
              <TableCell className="text-right font-medium figures">
                {formatMoney(product.sale_price, currency)}
              </TableCell>
              <TableCell
                className={`text-right figures ${margin !== null && margin < 0 ? 'text-destructive' : ''}`}
              >
                {margin === null ? <Dash /> : `${margin.toFixed(1)}%`}
              </TableCell>
              <TableCell
                className={`text-right figures ${Number(product.stock) === 0 ? 'text-muted-foreground' : ''}`}
              >
                {formatQuantity(product.stock, product.unit)}
              </TableCell>
              <TableCell className="text-right">
                <TrendCell product={product} trend={trends?.get(product.id)} />
              </TableCell>
              {/* Clicks here (including inside the menu) must not also open the row. */}
              <TableCell className="py-0 text-right" onClick={(event) => event.stopPropagation()}>
                {actions && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${product.name}`}>
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => actions.onEdit(product)}>
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      {product.active ? (
                        <DropdownMenuItem onSelect={() => actions.onSetActive(product, false)}>
                          <Archive />
                          Archive
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => actions.onSetActive(product, true)}>
                          <ArchiveRestore />
                          Restore
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
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
            <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-20" /></TableCell>
            <TableCell />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TrendCell({ product, trend }: { product: Product; trend?: SalesTrend }) {
  if (!trend) return null
  // Rounded like a forecast: 22.787 kg of bananas reads better as 22.8 kg in a narrow column.
  const sold = formatExpected(trend.total, product.unit)
  return (
    <div className="flex items-center justify-end gap-2">
      <Sparkline values={trend.quantities.map(Number)} label={`${sold} sold in the last 14 days`} />
      <span className="figures min-w-12 text-xs text-muted-foreground">{sold}</span>
    </div>
  )
}

function Dash() {
  return <span className="text-muted-foreground">—</span>
}
