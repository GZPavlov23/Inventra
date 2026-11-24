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
import { toApiError } from '@/lib/api'
import { type InvitationInput, teamApi } from '@/lib/team-api'
import { useT } from '@/i18n/language-context'

const ROLES: InvitationInput['role'][] = ['staff', 'manager']

export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t.settings.invite}</DialogTitle>
          <DialogDescription>
            {t.settings.inviteText}
          </DialogDescription>
        </DialogHeader>
        <InviteForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const t = useT()
  const [form, setForm] = useState<InvitationInput>({ email: '', full_name: '', role: 'staff' })

  const invite = useMutation({
    mutationFn: () => teamApi.invite(form),
    onSuccess: (member) => {
      void queryClient.invalidateQueries({ queryKey: ['team'] })
      toast.success(t.settings.invitationSent(member.email))
      onClose()
    },
  })

  const update = <Field extends keyof InvitationInput>(field: Field, value: InvitationInput[Field]) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (invite.isError) invite.reset()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    invite.mutate()
  }

  const error = invite.error ? toApiError(invite.error) : null
  // A taken address belongs to the email field; anything else is shown above the form.
  const fieldErrors = error?.code === 'conflict' ? { email: error.message } : (error?.fieldErrors ?? {})
  const showGeneral = error !== null && Object.keys(fieldErrors).length === 0

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showGeneral && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
      <FormField id="invite_name" label={t.settings.name} required error={fieldErrors.full_name}>
        <Input id="invite_name" required maxLength={120} aria-invalid={Boolean(fieldErrors.full_name)}
          value={form.full_name} onChange={(event) => update('full_name', event.target.value)} />
      </FormField>
      <FormField id="invite_email" label={t.settings.email} required error={fieldErrors.email}>
        <Input id="invite_email" type="email" required maxLength={254} autoComplete="off"
          aria-invalid={Boolean(fieldErrors.email)}
          value={form.email} onChange={(event) => update('email', event.target.value)} />
      </FormField>
      <FormField id="invite_role" label={t.settings.role} required
        hint={t.settings.roleMeanings[form.role]}>
        <Select value={form.role} onValueChange={(value) => update('role', value as InvitationInput['role'])}>
          <SelectTrigger id="invite_role" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLES.map((role) => <SelectItem key={role} value={role}>{t.roles[role]}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t.common.cancel}</Button>
        <Button type="submit" disabled={invite.isPending}>
          {invite.isPending && <Spinner />}
          {t.settings.sendInvitation}
        </Button>
      </DialogFooter>
    </form>
  )
}
