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
import { Textarea } from '@/components/ui/textarea'
import { type ApiError, toApiError } from '@/lib/api'
import { type Supplier, suppliersApi, type SupplierInput } from '@/lib/suppliers-api'
import { useT } from '@/i18n/language-context'

const EMPTY_SUPPLIER: SupplierInput = { name: '', contact_name: '', phone: '', email: '', notes: '' }

function toFormValues(supplier: Supplier): SupplierInput {
  return {
    name: supplier.name,
    contact_name: supplier.contact_name ?? '',
    phone: supplier.phone ?? '',
    email: supplier.email ?? '',
    notes: supplier.notes ?? '',
  }
}

type SupplierFormDialogProps = {
  // With a supplier it edits that supplier; without one it creates a new supplier.
  supplier?: Supplier
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SupplierFormDialog({ supplier, open, onOpenChange }: SupplierFormDialogProps) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{supplier ? t.suppliers.editTitle : t.suppliers.add}</DialogTitle>
          <DialogDescription>
            {supplier
              ? t.suppliers.editText
              : t.suppliers.addText}
          </DialogDescription>
        </DialogHeader>
        <SupplierForm key={supplier?.id} supplier={supplier} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function SupplierForm({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const queryClient = useQueryClient()
  const t = useT()
  const initialValues = supplier ? toFormValues(supplier) : EMPTY_SUPPLIER
  const [form, setForm] = useState<SupplierInput>(initialValues)

  const saveSupplier = useMutation({
    mutationFn: (values: SupplierInput) =>
      supplier ? suppliersApi.update(supplier.id, values) : suppliersApi.create(values),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      // Products show their supplier's name.
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(supplier ? t.products.saved(saved.name) : t.products.added(saved.name))
      onClose()
    },
  })

  const update = (field: keyof SupplierInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (saveSupplier.isError) saveSupplier.reset()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveSupplier.mutate(form)
  }

  const error: ApiError | null = saveSupplier.error ? toApiError(saveSupplier.error) : null
  // The server's only conflict is a name that is already taken.
  const fieldErrors = error?.code === 'conflict' ? { name: error.message } : (error?.fieldErrors ?? {})
  const showGeneralError = error !== null && Object.keys(fieldErrors).length === 0
  const hasChanges = JSON.stringify(form) !== JSON.stringify(initialValues)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showGeneralError && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <FormField id="supplier-name" label={t.suppliers.companyName} required error={fieldErrors.name}>
        <Input id="supplier-name" required maxLength={200} aria-invalid={Boolean(fieldErrors.name)}
          value={form.name} onChange={(event) => update('name', event.target.value)} />
      </FormField>

      <FormField id="contact_name" label={t.suppliers.contactPerson} error={fieldErrors.contact_name}>
        <Input id="contact_name" maxLength={120} aria-invalid={Boolean(fieldErrors.contact_name)}
          value={form.contact_name} onChange={(event) => update('contact_name', event.target.value)} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="phone" label={t.suppliers.phone} error={fieldErrors.phone}>
          <Input id="phone" type="tel" maxLength={32} aria-invalid={Boolean(fieldErrors.phone)}
            value={form.phone} onChange={(event) => update('phone', event.target.value)} />
        </FormField>
        <FormField id="supplier-email" label={t.suppliers.email} error={fieldErrors.email}>
          <Input id="supplier-email" type="email" maxLength={254} aria-invalid={Boolean(fieldErrors.email)}
            value={form.email} onChange={(event) => update('email', event.target.value)} />
        </FormField>
      </div>

      <FormField id="notes" label={t.suppliers.notes} error={fieldErrors.notes}
        hint={t.suppliers.notesHint}>
        <Textarea id="notes" maxLength={500} rows={3} aria-invalid={Boolean(fieldErrors.notes)}
          value={form.notes} onChange={(event) => update('notes', event.target.value)} />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t.common.cancel}</Button>
        <Button type="submit" disabled={saveSupplier.isPending || (Boolean(supplier) && !hasChanges)}>
          {saveSupplier.isPending && <Spinner />}
          {supplier ? t.products.saveChanges : t.suppliers.add}
        </Button>
      </DialogFooter>
    </form>
  )
}
