import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { FormField } from '@/components/form-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { type ApiError, toApiError } from '@/lib/api'
import { formatQuantity } from '@/lib/format'
import { type Batch, inventoryApi, type WasteReason } from '@/lib/inventory-api'
import { useT } from '@/i18n/language-context'

const REASONS: WasteReason[] = ['expired', 'damaged', 'other']

type WasteDialogProps = {
  batch?: Batch
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WasteDialog({ batch, open, onOpenChange }: WasteDialogProps) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.inventory.writeOffTitle}</DialogTitle>
          <DialogDescription>
            {batch && t.inventory.leftInBatch(batch.product.name, formatQuantity(batch.remaining_quantity, batch.product.unit))}
          </DialogDescription>
        </DialogHeader>
        {batch && <WasteForm key={batch.id} batch={batch} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function WasteForm({ batch, onClose }: { batch: Batch; onClose: () => void }) {
  const queryClient = useQueryClient()
  const t = useT()
  // Most often the whole batch goes, and an expired batch goes because it expired.
  const [quantity, setQuantity] = useState(String(Number(batch.remaining_quantity)))
  const [reason, setReason] = useState<WasteReason>(
    batch.expiry_status === 'expired' ? 'expired' : 'damaged',
  )
  const { unit, name } = batch.product

  const refreshStock = () => {
    void queryClient.invalidateQueries({ queryKey: ['batches'] })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const writeOff = useMutation({
    mutationFn: () => inventoryApi.writeOff(batch.id, { quantity, reason }),
    onSuccess: () => {
      refreshStock()
      toast.success(t.inventory.writtenOff(formatQuantity(quantity, unit), name))
      onClose()
    },
    // A refusal can mean a colleague changed this batch meanwhile, so show the real numbers.
    onError: refreshStock,
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    writeOff.mutate()
  }

  const error: ApiError | null = writeOff.error ? toApiError(writeOff.error) : null
  const fieldErrors =
    error?.code === 'insufficient_stock' || error?.code === 'invalid_quantity'
      ? { quantity: error.message }
      : (error?.fieldErrors ?? {})
  const showGeneralError = error !== null && Object.keys(fieldErrors).length === 0
  const smallestAmount = unit === 'pcs' ? '1' : '0.001'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showGeneralError && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="waste_quantity" label={t.inventory.quantityIn(t.units[unit])} required error={fieldErrors.quantity}>
          <Input id="waste_quantity" type="number" inputMode="decimal" required
            min={smallestAmount} step={smallestAmount} max={Number(batch.remaining_quantity)}
            aria-invalid={Boolean(fieldErrors.quantity)}
            value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </FormField>
        <FormField id="waste_reason" label={t.inventory.reason} required error={fieldErrors.reason}>
          <Select value={reason} onValueChange={(value) => setReason(value as WasteReason)}>
            <SelectTrigger id="waste_reason" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((value) => (
                <SelectItem key={value} value={value}>{t.inventory.reasons[value]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t.common.cancel}</Button>
        <Button type="submit" variant="destructive" disabled={writeOff.isPending}>
          {writeOff.isPending && <Spinner />}
          {t.inventory.writeOff}
        </Button>
      </DialogFooter>
    </form>
  )
}
