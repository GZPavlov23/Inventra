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
import { formatMoney, formatQuantity, marginPercent } from '@/lib/format'
import type { Product, ProductSort, SortOrder } from '@/lib/products-api'

const UNIT_LABELS = { pcs: 'pcs', kg: 'kg', l: 'l' } as const

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
  return (
    <TableHeader>
      <TableRow>
        <SortableHead column="name" label="Name" sorting={sorting} />
        <SortableHead column="category" label="Category" sorting={sorting} />
        <TableHead>Barcode</TableHead>
        <TableHead>Unit</TableHead>
        <SortableHead column="purchase_price" label="Purchase price" numeric sorting={sorting} />
        <SortableHead column="sale_price" label="Sale price" numeric sorting={sorting} />
        <SortableHead column="margin" label="Margin" numeric sorting={sorting} />
        <SortableHead column="stock" label="Stock" numeric sorting={sorting} />
        <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
      </TableRow>
    </TableHeader>
  )
}

type ProductsTableProps = {
  products: Product[]
  currency: string
  onEdit: (product: Product) => void
  onSetActive: (product: Product, active: boolean) => void
  sorting: SortState
}

export function ProductsTable({ products, currency, onEdit, onSetActive, sorting }: ProductsTableProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Products of your store</TableCaption>
      <TableHeadings sorting={sorting} />
      <TableBody>
        {products.map((product) => {
          const margin = marginPercent(product.purchase_price, product.sale_price)
          return (
            <TableRow key={product.id} className="cursor-pointer" onClick={() => onEdit(product)}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium">
                  {/* A real button, so keyboard users can open the row too. Its click
                      bubbles up to the row's onClick. */}
                  <button type="button" className="cursor-pointer text-left outline-offset-2">
                    {product.name}
                  </button>
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
              <TableCell
                className={`text-right tabular-nums ${Number(product.stock) === 0 ? 'text-muted-foreground' : ''}`}
              >
                {formatQuantity(product.stock, product.unit)}
              </TableCell>
              {/* Clicks here (including inside the menu) must not also open the row. */}
              <TableCell className="py-0 text-right" onClick={(event) => event.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${product.name}`}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onEdit(product)}>
                      <Pencil />
                      Edit
                    </DropdownMenuItem>
                    {product.active ? (
                      <DropdownMenuItem onSelect={() => onSetActive(product, false)}>
                        <Archive />
                        Archive
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => onSetActive(product, true)}>
                        <ArchiveRestore />
                        Restore
                      </DropdownMenuItem>
                    )}
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
            <TableCell><Skeleton className="ml-auto h-4 w-12" /></TableCell>
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
