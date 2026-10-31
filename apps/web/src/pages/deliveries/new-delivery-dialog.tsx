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
import { deliveriesApi } from '@/lib/deliveries-api'
import { formatMoney, lineCents, today } from '@/lib/format'
import type { Product } from '@/lib/products-api'
import { suppliersApi } from '@/lib/suppliers-api'

export function NewDeliveryDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A click outside doesn't close it, so a filled-in order isn't lost by accident.
          On small screens it scrolls, so the buttons can always be reached. */}
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>New delivery</DialogTitle>
          <DialogDescription>
            What you ordered from a supplier. Stock changes only when the goods arrive.
          </DialogDescription>
        </DialogHeader>
        <DeliveryForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function DeliveryForm({ onClose }: { onClose: () => void }) {
  const { store } = useCurrentUser()
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
      toast.success(`Delivery #${delivery.id} from ${delivery.supplier.name} was added`)
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
          A delivery comes from a supplier, and you don't have any yet.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button asChild><Link to="/suppliers">Go to Suppliers</Link></Button>
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
        <FormField id="delivery_supplier" label="Supplier" required>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger id="delivery_supplier" className="w-full">
              <SelectValue placeholder="Choose a supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.data?.items.map((supplier) => (
                <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="expected_on" label="Expected on" error={fieldErrors.expected_on}>
          <Input id="expected_on" type="date" min={today()}
            aria-invalid={Boolean(fieldErrors.expected_on)}
            value={expectedOn} onChange={(event) => setExpectedOn(event.target.value)} />
        </FormField>
      </div>

      <ProductPicker id="delivery_product" value={null} onChange={addProduct} placeholder="Add a product" />

      {lines.length > 0 && (
        <ul className="flex flex-col divide-y" aria-label="Products in this delivery">
          {lines.map((line) => (
            <ProductLineRow
              key={line.product.id}
              line={line}
              priceLabel="Cost"
              currency={store.currency}
              onChange={(changes) => updateLine(line.product.id, changes)}
              onRemove={() => removeLine(line.product.id)}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-lg font-semibold" aria-label="Delivery total">
          {formatMoney(totalCents / 100, store.currency)}
        </span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={create.isPending || lines.length === 0 || !supplierId}>
          {create.isPending && <Spinner />}
          Add delivery
        </Button>
      </DialogFooter>
    </form>
  )
}
