import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

// A row of readings, each a small card resting on the page.
export function StatPanel({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`grid gap-3 ${className}`}>{children}</div>
}

export function StatTile({ label, value, note }: { label: string; value?: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-card px-5 py-4 shadow-soft" role="group" aria-label={label}>
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
      {value === undefined ? (
        <Skeleton className="my-1 h-8 w-24" />
      ) : (
        <p className="figures font-heading text-3xl font-bold">{value}</p>
      )}
      {/* Keeps all the readings of a row the same height. */}
      <p className="min-h-4 text-xs text-muted-foreground">{note}</p>
    </div>
  )
}
