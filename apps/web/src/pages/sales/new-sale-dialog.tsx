import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { useCurrentUser } from '@/auth/use-auth'
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
import { formatMoney, lineCents } from '@/lib/format'
import type { Product } from '@/lib/products-api'
import { salesApi } from '@/lib/sales-api'

type CartLine = {
  product: Product
  quantity: string
  unitPrice: string
}

export function NewSaleDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A click outside doesn't close it, so a filled-in cart isn't lost by accident.
          On small screens it scrolls, so the buttons can always be reached. */}
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>New sale</DialogTitle>
          <DialogDescription>
            Stock leaves from the batches that expire first. Expired goods can't be sold.
          </DialogDescription>
        </DialogHeader>
        <SaleForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function SaleForm({ onClose }: { onClose: () => void }) {
  const { store } = useCurrentUser()
  const queryClient = useQueryClient()
  const [cart, setCart] = useState<CartLine[]>([])

  const refreshStock = () => {
    void queryClient.invalidateQueries({ queryKey: ['batches'] })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const record = useMutation({
    mutationFn: () =>
      salesApi.create({
        items: cart.map(({ product, quantity, unitPrice }) => ({
          product_id: product.id,
          quantity,
          unit_price: unitPrice,
        })),
      }),
    onSuccess: (sale) => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] })
      refreshStock()
      toast.success(`Sale of ${formatMoney(sale.total, store.currency)} recorded`)
      onClose()
    },
    // A refusal can mean the stock changed, so the picker should show the real numbers.
    onError: refreshStock,
  })

  // Scanning the same product again means one more of it, not a second line.
  const addProduct = (product: Product) => {
    if (record.isError) record.reset()
    setCart((current) =>
      current.some((line) => line.product.id === product.id)
        ? current.map((line) =>
            line.product.id === product.id
              ? { ...line, quantity: String(Number(line.quantity) + 1) }
              : line,
          )
        : [...current, { product, quantity: '1', unitPrice: product.sale_price }],
    )
  }

  const updateLine = (productId: number, changes: Partial<CartLine>) => {
    if (record.isError) record.reset()
    setCart((current) =>
      current.map((line) => (line.product.id === productId ? { ...line, ...changes } : line)),
    )
  }

  const removeLine = (productId: number) => {
    if (record.isError) record.reset()
    setCart((current) => current.filter((line) => line.product.id !== productId))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    record.mutate()
  }

  const error: ApiError | null = record.error ? toApiError(record.error) : null
  const totalCents = cart.reduce((sum, line) => sum + lineCents(line.quantity, line.unitPrice), 0)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.fieldErrors.items ?? error.message}</AlertDescription>
        </Alert>
      )}

      <ProductPicker id="sale_product" value={null} onChange={addProduct} placeholder="Add a product" />

      {cart.length > 0 && (
        <ul className="flex flex-col divide-y" aria-label="Products in this sale">
          {cart.map((line) => (
            <CartRow
              key={line.product.id}
              line={line}
              currency={store.currency}
              onChange={(changes) => updateLine(line.product.id, changes)}
              onRemove={() => removeLine(line.product.id)}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-lg font-semibold" aria-label="Sale total">
          {formatMoney(totalCents / 100, store.currency)}
        </span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={record.isPending || cart.length === 0}>
          {record.isPending && <Spinner />}
          Record sale
        </Button>
      </DialogFooter>
    </form>
  )
}

function CartRow({ line, currency, onChange, onRemove }: {
  line: CartLine
  currency: string
  onChange: (changes: Partial<CartLine>) => void
  onRemove: () => void
}) {
  const { product, quantity, unitPrice } = line
  // The browser refuses half a piece before the form is even sent.
  const smallestAmount = product.unit === 'pcs' ? '1' : '0.001'

  return (
    <li className="grid grid-cols-[1fr_auto] items-end gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[1fr_6rem_6rem_5rem_auto]">
      <div className="col-span-2 min-w-0 sm:col-span-1 sm:self-center">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <p className="text-xs text-muted-foreground">{product.unit}</p>
      </div>
      <div className="col-span-2 grid grid-cols-[1fr_1fr_5rem_auto] items-end gap-3 sm:contents">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Quantity</span>
          <Input type="number" inputMode="decimal" required aria-label={`Quantity of ${product.name}`}
            min={smallestAmount} step={smallestAmount} max="100000"
            value={quantity} onChange={(event) => onChange({ quantity: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Price</span>
          <Input type="number" inputMode="decimal" required aria-label={`Price of ${product.name}`}
            min="0" step="0.01"
            value={unitPrice} onChange={(event) => onChange({ unitPrice: event.target.value })} />
        </label>
        <span className="flex h-8 items-center justify-end text-sm font-medium tabular-nums">
          {formatMoney(lineCents(quantity, unitPrice) / 100, currency)}
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${product.name}`} onClick={onRemove}>
          <X />
        </Button>
      </div>
    </li>
  )
}
