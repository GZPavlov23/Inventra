import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { useCurrentUser } from '@/auth/use-auth'
import { FormField } from '@/components/form-field'
import { ProductPicker } from '@/components/product-picker'
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
import { formatQuantity, today } from '@/lib/format'
import { inventoryApi } from '@/lib/inventory-api'
import type { Batch } from '@/lib/inventory-api'
import type { Product } from '@/lib/products-api'
import { useT } from '@/i18n/language-context'

export function ReceiveDialog({ open, onOpenChange, onReceived }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReceived?: (batch: Batch) => void
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A click outside doesn't close it, so a filled-in form isn't lost by accident.
          On small screens it scrolls, so the buttons can always be reached. */}
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.inventory.receive}</DialogTitle>
          <DialogDescription>{t.inventory.receiveText}</DialogDescription>
        </DialogHeader>
        <ReceiveForm onReceived={onReceived} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ReceiveForm({ onReceived, onClose }: {
  onReceived?: (batch: Batch) => void
  onClose: () => void
}) {
  const { store } = useCurrentUser()
  const t = useT()
  const queryClient = useQueryClient()
  const [product, setProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [lotCode, setLotCode] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')

  const receive = useMutation({
    mutationFn: (productId: number) =>
      inventoryApi.receive({
        product_id: productId,
        quantity,
        expiry_date: expiryDate || null,
        lot_code: lotCode,
        // Left empty, the batch takes the product's current purchase price.
        purchase_price: purchasePrice || null,
      }),
    onSuccess: (batch) => {
      void queryClient.invalidateQueries({ queryKey: ['batches'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      const amount = formatQuantity(batch.received_quantity, batch.product.unit)
      toast.success(t.inventory.received(amount, batch.product.name))
      onReceived?.(batch)
      onClose()
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (product) receive.mutate(product.id)
  }

  const error: ApiError | null = receive.error ? toApiError(receive.error) : null
  const fieldErrors =
    error?.code === 'invalid_receipt'
      ? { expiry_date: error.message }
      : error?.code === 'invalid_quantity'
        ? { quantity: error.message }
        : (error?.fieldErrors ?? {})
  const showGeneralError = error !== null && Object.keys(fieldErrors).length === 0
  // The browser refuses half a piece before the form is even sent.
  const smallestAmount = product?.unit === 'pcs' || !product ? '1' : '0.001'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showGeneralError && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <FormField id="product" label={t.inventory.product} required>
        <ProductPicker id="product" value={product} onChange={setProduct} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="quantity" label={product ? t.inventory.quantityIn(t.units[product.unit]) : t.inventory.quantity} required
          error={fieldErrors.quantity}>
          <Input id="quantity" type="number" inputMode="decimal" required
            min={smallestAmount} step={smallestAmount} max="100000"
            aria-invalid={Boolean(fieldErrors.quantity)}
            value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </FormField>
        <FormField id="expiry_date" label={t.inventory.expiryDate} error={fieldErrors.expiry_date}
          hint={t.inventory.expiryHint}>
          <Input id="expiry_date" type="date" min={today()}
            aria-invalid={Boolean(fieldErrors.expiry_date)}
            value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="lot_code" label={t.inventory.lotNumber} error={fieldErrors.lot_code}>
          <Input id="lot_code" maxLength={64} autoComplete="off"
            aria-invalid={Boolean(fieldErrors.lot_code)}
            value={lotCode} onChange={(event) => setLotCode(event.target.value)} />
        </FormField>
        <FormField id="purchase_price" label={t.inventory.purchasePriceIn(store.currency)}
          error={fieldErrors.purchase_price}>
          <Input id="purchase_price" type="number" inputMode="decimal" min="0" step="0.01"
            placeholder={product?.purchase_price}
            aria-invalid={Boolean(fieldErrors.purchase_price)}
            value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} />
        </FormField>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t.common.cancel}</Button>
        <Button type="submit" disabled={receive.isPending || !product}>
          {receive.isPending && <Spinner />}
          {t.inventory.receive}
        </Button>
      </DialogFooter>
    </form>
  )
}
