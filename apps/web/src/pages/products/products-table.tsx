import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronsUpDown, Ellipsis, Pencil } from 'lucide-react'
import { Link } from 'react-router'

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
import { formatExpected, formatMoney, formatPercent, formatQuantity, marginPercent } from '@/lib/format'
import type { Product, ProductSort, SortOrder } from '@/lib/products-api'
import type { SalesTrend } from '@/lib/reports-api'
import { useT } from '@/i18n/language-context'

// The same stretch as the products page asks for.
const TREND_DAYS = 14

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
        className={`inline-flex cursor-pointer items-center gap-1 outline-offset-2 hover:text-foreground ${
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
  const t = useT()
  return (
    <TableHeader>
      <TableRow>
        <SortableHead column="name" label={t.products.name} sorting={sorting} />
        <SortableHead column="category" label={t.products.category} sorting={sorting} />
        <SortableHead column="purchase_price" label={t.products.purchasePrice} numeric sorting={sorting} />
        <SortableHead column="sale_price" label={t.products.salePrice} numeric sorting={sorting} />
        <SortableHead column="margin" label={t.products.margin} numeric sorting={sorting} />
        <SortableHead column="stock" label={t.products.stock} numeric sorting={sorting} />
        <TableHead className="text-right">{t.products.lastDays(TREND_DAYS)}</TableHead>
        <TableHead className="w-10"><span className="sr-only">{t.inventory.actions}</span></TableHead>
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
  const t = useT()
  return (
    <Table>
      <TableCaption className="sr-only">{t.products.caption}</TableCaption>
      <TableHeadings sorting={sorting} />
      <TableBody>
        {products.map((product) => {
          const margin = marginPercent(product.purchase_price, product.sale_price)
          return (
            <TableRow key={product.id} className={actions && 'cursor-pointer'} data-new={product.id === justSaved}
              onClick={actions && (() => actions.onEdit(product))}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium">
                  {/* The name leads to the product's story; the rest of the row, for those who
                      may, opens the form to edit it (also in the row's menu). */}
                  <Link to={`/products/${product.id}`} onClick={(event) => event.stopPropagation()}
                    className="text-left underline-offset-4 outline-offset-2 hover:underline">
                    {product.name}
                  </Link>
                  {!product.active && <Badge variant="outline">{t.products.archivedBadge}</Badge>}
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
                {margin === null ? <Dash /> : formatPercent(margin)}
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
                      <Button variant="ghost" size="icon-sm" aria-label={t.inventory.actionsFor(product.name)}>
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => actions.onEdit(product)}>
                        <Pencil />
                        {t.products.edit}
                      </DropdownMenuItem>
                      {product.active ? (
                        <DropdownMenuItem onSelect={() => actions.onSetActive(product, false)}>
                          <Archive />
                          {t.products.archive}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => actions.onSetActive(product, true)}>
                          <ArchiveRestore />
                          {t.products.restore}
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
  const t = useT()
  return (
    <Table aria-busy="true">
      <TableCaption className="sr-only">{t.products.loading}</TableCaption>
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
  const t = useT()
  if (!trend) return null
  // Rounded like a forecast: 22.787 kg of bananas reads better as 22.8 kg in a narrow column.
  const sold = formatExpected(trend.total, product.unit)
  return (
    <div className="flex items-center justify-end gap-2">
      <Sparkline values={trend.quantities.map(Number)} label={t.products.soldIn(sold, TREND_DAYS)} />
      <span className="figures min-w-12 text-xs text-muted-foreground">{sold}</span>
    </div>
  )
}

function Dash() {
  return <span className="text-muted-foreground">—</span>
}
