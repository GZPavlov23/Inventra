import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function StatTile({ label, value, note }: { label: string; value?: string; note?: string }) {
  return (
    <Card className="gap-1 px-4" role="group" aria-label={label}>
      <p className="text-sm text-muted-foreground">{label}</p>
      {value === undefined ? (
        <Skeleton className="my-1 h-7 w-24" />
      ) : (
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      )}
      {/* Keeps all the tiles of a row the same height. */}
      <p className="min-h-4 text-xs text-muted-foreground">{note}</p>
    </Card>
  )
}
