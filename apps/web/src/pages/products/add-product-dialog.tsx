import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { toast } from 'sonner'

import { useCurrentUser } from '@/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { type ApiError, toApiError } from '@/lib/api'
import { marginPercent } from '@/lib/format'
import { productsApi, type ProductInput, type ProductUnit } from '@/lib/products-api'
import { CategoryCombobox } from '@/pages/products/category-combobox'

const EMPTY_PRODUCT: ProductInput = {
  name: '',
  brand: '',
  category: '',
  barcode: '',
  unit: 'pcs',
  purchase_price: '',
  sale_price: '',
}

const UNITS: { value: ProductUnit; label: string }[] = [
  { value: 'pcs', label: 'Pieces' },
  { value: 'kg', label: 'Kilograms' },
  { value: 'l', label: 'Liters' },
]

export function AddProductDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add product
        </Button>
      </DialogTrigger>
      {/* A click outside doesn't close it, so a filled-in form isn't lost by accident.
          On small screens it scrolls, so the buttons can always be reached. */}
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add product</DialogTitle>
          <DialogDescription>Add a product to your catalog. Only the marked fields are required.</DialogDescription>
        </DialogHeader>
        {/* The form only exists while the dialog is open, so it always starts empty. */}
        <AddProductForm onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function AddProductForm({ onClose }: { onClose: () => void }) {
  const { store } = useCurrentUser()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ProductInput>(EMPTY_PRODUCT)

  const createProduct = useMutation({
    mutationFn: productsApi.create,
    onSuccess: (product) => {
      // Marks every product list as out of date, so the table refetches and shows the new row.
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(`${product.name} was added`)
      onClose()
    },
  })

  const update = (field: keyof ProductInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (createProduct.isError) createProduct.reset()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    createProduct.mutate(form)
  }

  const error: ApiError | null = createProduct.error ? toApiError(createProduct.error) : null
  // The only conflict a new product can have is a barcode that is already taken.
  const fieldErrors = error?.code === 'conflict' ? { barcode: error.message } : (error?.fieldErrors ?? {})
  const showGeneralError = error !== null && Object.keys(fieldErrors).length === 0

  const margin =
    form.purchase_price && form.sale_price ? marginPercent(form.purchase_price, form.sale_price) : null

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showGeneralError && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <Field id="name" label="Name" required error={fieldErrors.name}>
        <Input id="name" required maxLength={200} aria-invalid={Boolean(fieldErrors.name)}
          placeholder="Fresh milk 3% 1 l"
          value={form.name} onChange={(event) => update('name', event.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="brand" label="Brand" error={fieldErrors.brand}>
          <Input id="brand" maxLength={120} aria-invalid={Boolean(fieldErrors.brand)}
            value={form.brand} onChange={(event) => update('brand', event.target.value)} />
        </Field>
        <Field id="category" label="Category" error={fieldErrors.category}>
          <CategoryCombobox id="category" invalid={Boolean(fieldErrors.category)}
            value={form.category} onChange={(category) => update('category', category)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="barcode" label="Barcode" error={fieldErrors.barcode}>
          <Input id="barcode" inputMode="numeric" maxLength={14} autoComplete="off"
            aria-invalid={Boolean(fieldErrors.barcode)}
            value={form.barcode} onChange={(event) => update('barcode', event.target.value)} />
        </Field>
        <Field id="unit" label="Sold by" required error={fieldErrors.unit}>
          <Select value={form.unit} onValueChange={(value) => update('unit', value)}>
            <SelectTrigger id="unit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="purchase_price" label={`Purchase price (${store.currency})`} required
          error={fieldErrors.purchase_price}>
          <Input id="purchase_price" type="number" inputMode="decimal" required min="0" step="0.01"
            aria-invalid={Boolean(fieldErrors.purchase_price)}
            value={form.purchase_price} onChange={(event) => update('purchase_price', event.target.value)} />
        </Field>
        <Field id="sale_price" label={`Sale price (${store.currency})`} required
          error={fieldErrors.sale_price}>
          <Input id="sale_price" type="number" inputMode="decimal" required min="0" step="0.01"
            aria-invalid={Boolean(fieldErrors.sale_price)}
            value={form.sale_price} onChange={(event) => update('sale_price', event.target.value)} />
        </Field>
      </div>

      {margin !== null && (
        <p className={`text-sm ${margin < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
          {margin < 0 ? 'The sale price is below the purchase price. ' : ''}
          Margin: <span className="font-medium tabular-nums">{margin.toFixed(1)}%</span>
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={createProduct.isPending}>
          {createProduct.isPending && <Spinner />}
          Add product
        </Button>
      </DialogFooter>
    </form>
  )
}

function Field({ id, label, required, error, children }: {
  id: string
  label: string
  required?: boolean
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive" aria-hidden> *</span>}
      </Label>
      {children}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
