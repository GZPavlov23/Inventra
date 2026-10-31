import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { useCurrentUser } from '@/auth/use-auth'
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
import { marginPercent } from '@/lib/format'
import { type Product, productsApi, type ProductInput, type ProductUnit } from '@/lib/products-api'
import { suppliersApi } from '@/lib/suppliers-api'
import { CategoryCombobox } from '@/pages/products/category-combobox'

const EMPTY_PRODUCT: ProductInput = {
  name: '',
  brand: '',
  category: '',
  barcode: '',
  unit: 'pcs',
  purchase_price: '',
  sale_price: '',
  supplier_id: null,
}

// A Select can't hold an empty value, so "no supplier" needs a name of its own.
const NO_SUPPLIER = 'none'

const UNITS: { value: ProductUnit; label: string }[] = [
  { value: 'pcs', label: 'Pieces' },
  { value: 'kg', label: 'Kilograms' },
  { value: 'l', label: 'Liters' },
]

function toFormValues(product: Product): ProductInput {
  return {
    name: product.name,
    brand: product.brand ?? '',
    category: product.category ?? '',
    barcode: product.barcode ?? '',
    unit: product.unit,
    purchase_price: product.purchase_price,
    sale_price: product.sale_price,
    supplier_id: product.supplier?.id ?? null,
  }
}

type ProductFormDialogProps = {
  // With a product it edits that product; without one it creates a new product.
  product?: Product
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProductFormDialog({ product, open, onOpenChange }: ProductFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A click outside doesn't close it, so a filled-in form isn't lost by accident.
          On small screens it scrolls, so the buttons can always be reached. */}
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{product ? 'Edit product' : 'Add product'}</DialogTitle>
          <DialogDescription>
            {product
              ? 'Change the details of this product.'
              : 'Add a product to your catalog. Only the marked fields are required.'}
          </DialogDescription>
        </DialogHeader>
        {/* The form only exists while the dialog is open, so it always starts from fresh values. */}
        <ProductForm key={product?.id} product={product} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const { store } = useCurrentUser()
  const queryClient = useQueryClient()
  const initialValues = product ? toFormValues(product) : EMPTY_PRODUCT
  const [form, setForm] = useState<ProductInput>(initialValues)

  const suppliers = useQuery({ queryKey: ['suppliers', 'choices'], queryFn: suppliersApi.choices })
  const supplierChoices = suppliers.data?.items ?? []
  // A product keeps a supplier that was archived, so it stays in the list for this product only.
  const currentSupplier = product?.supplier
  const keepCurrentChoice =
    currentSupplier && !supplierChoices.some((choice) => choice.id === currentSupplier.id)

  const saveProduct = useMutation({
    mutationFn: (values: ProductInput) =>
      product ? productsApi.update(product.id, values) : productsApi.create(values),
    onSuccess: (saved) => {
      // Marks every product list as out of date, so the table refetches and shows the change.
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(product ? `${saved.name} was saved` : `${saved.name} was added`)
      onClose()
    },
  })

  const update = <Field extends keyof ProductInput>(field: Field, value: ProductInput[Field]) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (saveProduct.isError) saveProduct.reset()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveProduct.mutate(form)
  }

  const error: ApiError | null = saveProduct.error ? toApiError(saveProduct.error) : null
  // The server's conflicts each belong to one field: a taken barcode or a unit that is locked.
  const fieldErrors =
    error?.code === 'conflict'
      ? { barcode: error.message }
      : error?.code === 'unit_locked'
        ? { unit: error.message }
        : error?.code === 'supplier_archived'
          ? { supplier_id: error.message }
          : (error?.fieldErrors ?? {})
  const showGeneralError = error !== null && Object.keys(fieldErrors).length === 0

  const margin =
    form.purchase_price && form.sale_price ? marginPercent(form.purchase_price, form.sale_price) : null
  const hasChanges = JSON.stringify(form) !== JSON.stringify(initialValues)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showGeneralError && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <FormField id="name" label="Name" required error={fieldErrors.name}>
        <Input id="name" required maxLength={200} aria-invalid={Boolean(fieldErrors.name)}
          placeholder="Fresh milk 3% 1 l"
          value={form.name} onChange={(event) => update('name', event.target.value)} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="brand" label="Brand" error={fieldErrors.brand}>
          <Input id="brand" maxLength={120} aria-invalid={Boolean(fieldErrors.brand)}
            value={form.brand} onChange={(event) => update('brand', event.target.value)} />
        </FormField>
        <FormField id="category" label="Category" error={fieldErrors.category}>
          <CategoryCombobox id="category" invalid={Boolean(fieldErrors.category)}
            value={form.category} onChange={(category) => update('category', category)} />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="barcode" label="Barcode" error={fieldErrors.barcode}>
          <Input id="barcode" inputMode="numeric" maxLength={14} autoComplete="off"
            aria-invalid={Boolean(fieldErrors.barcode)}
            value={form.barcode} onChange={(event) => update('barcode', event.target.value)} />
        </FormField>
        <FormField id="unit" label="Sold by" required error={fieldErrors.unit}>
          <Select value={form.unit} onValueChange={(value) => update('unit', value as ProductUnit)}>
            <SelectTrigger id="unit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField id="supplier" label="Supplier" error={fieldErrors.supplier_id}>
        <Select
          value={form.supplier_id === null ? NO_SUPPLIER : String(form.supplier_id)}
          onValueChange={(value) => update('supplier_id', value === NO_SUPPLIER ? null : Number(value))}
        >
          <SelectTrigger id="supplier" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SUPPLIER}>No supplier</SelectItem>
            {keepCurrentChoice && (
              <SelectItem value={String(currentSupplier.id)}>
                {currentSupplier.name}{currentSupplier.active ? '' : ' (archived)'}
              </SelectItem>
            )}
            {supplierChoices.map((choice) => (
              <SelectItem key={choice.id} value={String(choice.id)}>{choice.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="purchase_price" label={`Purchase price (${store.currency})`} required
          error={fieldErrors.purchase_price}>
          <Input id="purchase_price" type="number" inputMode="decimal" required min="0" step="0.01"
            aria-invalid={Boolean(fieldErrors.purchase_price)}
            value={form.purchase_price} onChange={(event) => update('purchase_price', event.target.value)} />
        </FormField>
        <FormField id="sale_price" label={`Sale price (${store.currency})`} required
          error={fieldErrors.sale_price}>
          <Input id="sale_price" type="number" inputMode="decimal" required min="0" step="0.01"
            aria-invalid={Boolean(fieldErrors.sale_price)}
            value={form.sale_price} onChange={(event) => update('sale_price', event.target.value)} />
        </FormField>
      </div>

      {margin !== null && (
        <p className={`text-sm ${margin < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
          {margin < 0 ? 'The sale price is below the purchase price. ' : ''}
          Margin: <span className="font-medium tabular-nums">{margin.toFixed(1)}%</span>
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saveProduct.isPending || (Boolean(product) && !hasChanges)}>
          {saveProduct.isPending && <Spinner />}
          {product ? 'Save changes' : 'Add product'}
        </Button>
      </DialogFooter>
    </form>
  )
}
