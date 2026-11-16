import { Archive, ArchiveRestore, Ellipsis, Pencil } from 'lucide-react'

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
import type { Supplier } from '@/lib/suppliers-api'

function TableHeadings() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Contact</TableHead>
        <TableHead>Phone</TableHead>
        <TableHead>Email</TableHead>
        <TableHead className="text-right">Products</TableHead>
        <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
      </TableRow>
    </TableHeader>
  )
}

type SuppliersTableProps = {
  suppliers: Supplier[]
  // Left out for roles that can't change it: the table is then only for looking things up.
  actions?: {
    onEdit: (supplier: Supplier) => void
    onSetActive: (supplier: Supplier, active: boolean) => void
  }
}

export function SuppliersTable({ suppliers, actions }: SuppliersTableProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Suppliers of your store</TableCaption>
      <TableHeadings />
      <TableBody>
        {suppliers.map((supplier) => (
          <TableRow key={supplier.id} className={actions && 'cursor-pointer'}
            onClick={actions && (() => actions.onEdit(supplier))}>
            <TableCell>
              <div className="flex items-center gap-2 font-medium">
                {/* A real button, so keyboard users can open the row too. */}
                {actions ? (
                  <button type="button" className="cursor-pointer text-left outline-offset-2">
                    {supplier.name}
                  </button>
                ) : supplier.name}
                {!supplier.active && <Badge variant="outline">Archived</Badge>}
              </div>
              {supplier.notes && (
                <div className="max-w-64 truncate text-xs text-muted-foreground" title={supplier.notes}>
                  {supplier.notes}
                </div>
              )}
            </TableCell>
            <TableCell>{supplier.contact_name ?? <Dash />}</TableCell>
            <TableCell>
              {supplier.phone ? <ContactLink href={`tel:${supplier.phone}`}>{supplier.phone}</ContactLink> : <Dash />}
            </TableCell>
            <TableCell>
              {supplier.email ? <ContactLink href={`mailto:${supplier.email}`}>{supplier.email}</ContactLink> : <Dash />}
            </TableCell>
            <TableCell className="text-right figures">{supplier.product_count}</TableCell>
            <TableCell className="py-0 text-right" onClick={(event) => event.stopPropagation()}>
              {actions && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${supplier.name}`}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => actions.onEdit(supplier)}>
                      <Pencil />
                      Edit
                    </DropdownMenuItem>
                    {supplier.active ? (
                      <DropdownMenuItem onSelect={() => actions.onSetActive(supplier, false)}>
                        <Archive />
                        Archive
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => actions.onSetActive(supplier, true)}>
                        <ArchiveRestore />
                        Restore
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function SuppliersTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Table aria-busy="true">
      <TableCaption className="sr-only">Loading suppliers</TableCaption>
      <TableHeadings />
      <TableBody>
        {Array.from({ length: rows }, (_, index) => (
          <TableRow key={index}>
            <TableCell><Skeleton className="h-4 w-44" /></TableCell>
            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-40" /></TableCell>
            <TableCell><Skeleton className="ml-auto h-4 w-8" /></TableCell>
            <TableCell />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// A click on a phone or email calls or writes, it doesn't also open the form behind it.
function ContactLink({ href, children }: { href: string; children: string }) {
  return (
    <a className="figures hover:underline" href={href} onClick={(event) => event.stopPropagation()}>
      {children}
    </a>
  )
}

function Dash() {
  return <span className="text-muted-foreground">—</span>
}
