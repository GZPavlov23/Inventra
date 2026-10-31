import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatExpected, formatWeekday } from '@/lib/format'
import type { ProductForecast } from '@/lib/forecasts-api'
import { RankedBars } from '@/pages/dashboard/ranked-bars'

type ForecastDetailsDialogProps = {
  item?: ProductForecast
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ForecastDetailsDialog({ item, open, onOpenChange }: ForecastDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item?.product.name}</DialogTitle>
          <DialogDescription>
            {item && `Expected sales per day, based on ${item.history_days} days of history.`}
          </DialogDescription>
        </DialogHeader>
        {item && (
          <RankedBars
            label="Expected sales per day"
            rows={item.days.map(({ day, quantity }) => ({
              key: day,
              label: formatWeekday(day),
              amount: Number(quantity),
              value: formatExpected(quantity, item.product.unit),
            }))}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
