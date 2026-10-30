import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PAGE_SIZE } from '@/hooks/use-list-params'

export function Pagination({ page, total, onPageChange }: {
  page: number
  total: number
  onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const first = (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <p>
        Showing <span className="font-medium text-foreground">{first}–{last}</span> of{' '}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft /> Previous
          </Button>
          <span>Page {page} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            Next <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}
