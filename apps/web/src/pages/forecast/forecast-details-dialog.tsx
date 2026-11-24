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
import { useT } from '@/i18n/language-context'

type ForecastDetailsDialogProps = {
  item?: ProductForecast
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ForecastDetailsDialog({ item, open, onOpenChange }: ForecastDetailsDialogProps) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item?.product.name}</DialogTitle>
          <DialogDescription>
            {item && t.forecast.basedOn(item.history_days)}
          </DialogDescription>
        </DialogHeader>
        {item && (
          <RankedBars
            label={t.forecast.perDay}
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
