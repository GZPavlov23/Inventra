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
import { Spinner } from '@/components/ui/spinner'
import { type ApiError, toApiError } from '@/lib/api'
import { formatChange, formatQuantity } from '@/lib/format'
import { type Batch, inventoryApi } from '@/lib/inventory-api'
import { useT } from '@/i18n/language-context'

type CorrectionDialogProps = {
  batch?: Batch
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CorrectionDialog({ batch, open, onOpenChange }: CorrectionDialogProps) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.inventory.correct}</DialogTitle>
          <DialogDescription>
            {batch && t.inventory.systemShows(batch.product.name, formatQuantity(batch.remaining_quantity, batch.product.unit))}
          </DialogDescription>
        </DialogHeader>
        {batch && <CorrectionForm key={batch.id} batch={batch} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function CorrectionForm({ batch, onClose }: { batch: Batch; onClose: () => void }) {
  const queryClient = useQueryClient()
  const t = useT()
  const [counted, setCounted] = useState('')
  const [reason, setReason] = useState('')
  const { unit, name } = batch.product

  // People count what is on the shelf, so they type that number and the difference follows.
  // toFixed removes the tiny errors of decimal arithmetic in JavaScript (0.1 + 0.2).
  const difference = counted === '' ? null : (Number(counted) - Number(batch.remaining_quantity)).toFixed(3)
  const changed = difference !== null && Number(difference) !== 0

  const refreshStock = () => {
    void queryClient.invalidateQueries({ queryKey: ['batches'] })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const correct = useMutation({
    mutationFn: (quantityDelta: string) =>
      inventoryApi.adjust(batch.id, {
        quantity_delta: quantityDelta,
        reason,
        expected_quantity: batch.remaining_quantity,
      }),
    onSuccess: () => {
      refreshStock()
      toast.success(t.inventory.correctedTo(name, formatQuantity(counted, unit)))
      onClose()
    },
    // Refused because a colleague changed this batch: show the new number and the new difference.
    onError: refreshStock,
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (changed) correct.mutate(difference)
  }

  const error: ApiError | null = correct.error ? toApiError(correct.error) : null
  const fieldErrors = error?.code === 'invalid_quantity' ? { counted: error.message } : (error?.fieldErrors ?? {})
  const showGeneralError = error !== null && Object.keys(fieldErrors).length === 0
  const smallestAmount = unit === 'pcs' ? '1' : '0.001'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showGeneralError && (
        <Alert variant="destructive">
          <AlertDescription>
            {error.code === 'stock_changed' ? t.inventory.checkCount(error.message) : error.message}
          </AlertDescription>
        </Alert>
      )}

      <FormField id="counted" label={t.inventory.countedIn(t.units[unit])} required error={fieldErrors.counted}>
        <Input id="counted" type="number" inputMode="decimal" required min="0" step={smallestAmount}
          aria-invalid={Boolean(fieldErrors.counted)}
          value={counted} onChange={(event) => setCounted(event.target.value)} />
      </FormField>

      <FormField id="correction_reason" label={t.inventory.reason} required error={fieldErrors.reason}>
        <Input id="correction_reason" required maxLength={200} placeholder={t.inventory.stocktaking}
          aria-invalid={Boolean(fieldErrors.reason)}
          value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>

      {difference !== null && (
        <p className="text-sm text-muted-foreground">
          {changed ? (
            <>{t.inventory.difference} <span className="font-medium figures">{formatChange(difference, unit)}</span></>
          ) : (
            t.inventory.nothingToCorrect
          )}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t.common.cancel}</Button>
        <Button type="submit" disabled={correct.isPending || !changed}>
          {correct.isPending && <Spinner />}
          {t.inventory.saveCorrection}
        </Button>
      </DialogFooter>
    </form>
  )
}
