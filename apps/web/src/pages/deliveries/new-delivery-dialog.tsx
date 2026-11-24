import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { useCurrentUser } from '@/auth/use-auth'
import { FormField } from '@/components/form-field'
import { type ProductLine, ProductLineRow } from '@/components/product-line-row'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { type ApiError, toApiError } from '@/lib/api'
import { deliveriesApi, type Delivery } from '@/lib/deliveries-api'
import { formatMoney, lineCents, today } from '@/lib/format'
import type { Product } from '@/lib/products-api'
import { suppliersApi } from '@/lib/suppliers-api'
import { useT } from '@/i18n/language-context'

export function NewDeliveryDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (delivery: Delivery) => void
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A click outside doesn't close it, so a filled-in order isn't lost by accident.
          On small screens it scrolls, so the buttons can always be reached. */}
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.deliveries.new}</DialogTitle>
          <DialogDescription>
            {t.deliveries.newText}
          </DialogDescription>
        </DialogHeader>
        <DeliveryForm onCreated={onCreated} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function DeliveryForm({ onCreated, onClose }: {
  onCreated?: (delivery: Delivery) => void
  onClose: () => void
}) {
  const { store } = useCurrentUser()
  const t = useT()
  const queryClient = useQueryClient()
  const [supplierId, setSupplierId] = useState('')
  const [expectedOn, setExpectedOn] = useState('')
  const [lines, setLines] = useState<ProductLine[]>([])

  const suppliers = useQuery({ queryKey: ['suppliers', 'choices'], queryFn: suppliersApi.choices })

  const create = useMutation({
    mutationFn: () =>
      deliveriesApi.create({
        supplier_id: Number(supplierId),
        expected_on: expectedOn || null,
        items: lines.map(({ product, quantity, unitPrice }) => ({
          product_id: product.id,
          quantity,
          unit_cost: unitPrice,
        })),
      }),
    onSuccess: (delivery) => {
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] })
      toast.success(t.deliveries.added(delivery.id, delivery.supplier.name))
      onCreated?.(delivery)
      onClose()
    },
  })

  // Picking the same product again means one more of it, not a second line.
  const addProduct = (product: Product) => {
    if (create.isError) create.reset()
    setLines((current) =>
      current.some((line) => line.product.id === product.id)
        ? current.map((line) =>
            line.product.id === product.id
              ? { ...line, quantity: String(Number(line.quantity) + 1) }
              : line,
          )
        : [...current, { product, quantity: '1', unitPrice: product.purchase_price }],
    )
  }

  const updateLine = (productId: number, changes: Partial<ProductLine>) => {
    if (create.isError) create.reset()
    setLines((current) =>
      current.map((line) => (line.product.id === productId ? { ...line, ...changes } : line)),
    )
  }

  const removeLine = (productId: number) => {
    if (create.isError) create.reset()
    setLines((current) => current.filter((line) => line.product.id !== productId))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    create.mutate()
  }

  if (suppliers.data?.total === 0) {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          {t.deliveries.noSuppliers}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t.common.cancel}</Button>
          <Button asChild><Link to="/suppliers">{t.deliveries.goToSuppliers}</Link></Button>
        </DialogFooter>
      </>
    )
  }

  const error: ApiError | null = create.error ? toApiError(create.error) : null
  const fieldErrors = error?.code === 'invalid_receipt' ? { expected_on: error.message } : (error?.fieldErrors ?? {})
  const showGeneralError = error !== null && !fieldErrors.expected_on
  const totalCents = lines.reduce((sum, line) => sum + lineCents(line.quantity, line.unitPrice), 0)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showGeneralError && (
        <Alert variant="destructive">
          <AlertDescription>{error.fieldErrors.items ?? error.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="delivery_supplier" label={t.deliveries.supplier} required>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger id="delivery_supplier" className="w-full">
              <SelectValue placeholder={t.deliveries.chooseSupplier} />
            </SelectTrigger>
            <SelectContent>
              {suppliers.data?.items.map((supplier) => (
                <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="expected_on" label={t.deliveries.expectedLabel} error={fieldErrors.expected_on}>
          <Input id="expected_on" type="date" min={today()}
            aria-invalid={Boolean(fieldErrors.expected_on)}
            value={expectedOn} onChange={(event) => setExpectedOn(event.target.value)} />
        </FormField>
      </div>

      <ProductPicker id="delivery_product" value={null} onChange={addProduct} placeholder={t.sales.addProduct} />

      {lines.length > 0 && (
        <ul className="flex flex-col divide-y" aria-label={t.deliveries.inThisDelivery}>
          {lines.map((line) => (
            <ProductLineRow
              key={line.product.id}
              line={line}
              priceLabel={t.deliveries.cost}
              currency={store.currency}
              onChange={(changes) => updateLine(line.product.id, changes)}
              onRemove={() => removeLine(line.product.id)}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">{t.deliveries.total}</span>
        <span className="text-lg font-semibold" aria-label={t.deliveries.deliveryTotal}>
          {formatMoney(totalCents / 100, store.currency)}
        </span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t.common.cancel}</Button>
        <Button type="submit" disabled={create.isPending || lines.length === 0 || !supplierId}>
          {create.isPending && <Spinner />}
          {t.deliveries.add}
        </Button>
      </DialogFooter>
    </form>
  )
}
