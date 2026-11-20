import { useMutation } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { useCurrentUser } from '@/auth/use-auth'
import { PasswordInput } from '@/components/auth/password-input'
import { FormField } from '@/components/form-field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { toApiError } from '@/lib/api'
import { authApi, type Permission, ROLE_LABELS } from '@/lib/auth-api'

// In the order a working day meets them.
const PERMISSION_TEXT: Record<Permission, string> = {
  sell: 'Record sales at the till',
  handle_stock: 'Receive goods and deliveries, write off and correct stock',
  manage_catalog: 'Add and change products, prices and suppliers',
  plan: 'Use the forecast, make orders and place deliveries, import sales',
  see_finances: 'See the dashboard, reports, sales and profit',
  manage_team: 'Invite people, change their roles and rename the store',
}

export function AccountSection() {
  const user = useCurrentUser()
  const allowed = (Object.keys(PERMISSION_TEXT) as Permission[]).filter((p) => user.permissions.includes(p))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Your account <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
        </CardTitle>
        <CardDescription>{user.full_name} · {user.email}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">What your role can do</h3>
          <ul className="flex flex-col gap-1.5" aria-label="What your role can do">
            {allowed.map((permission) => (
              <li key={permission} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-good" />
                {PERMISSION_TEXT[permission]}
              </li>
            ))}
          </ul>
        </div>
        <ChangePasswordForm />
      </CardContent>
    </Card>
  )
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [mismatch, setMismatch] = useState(false)

  const change = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: () => {
      toast.success('Password changed. Your other devices were logged out')
      setCurrent('')
      setNext('')
      setRepeat('')
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (next !== repeat) {
      setMismatch(true)
      return
    }
    change.mutate()
  }

  const error = change.error ? toApiError(change.error) : null
  const reset = () => {
    setMismatch(false)
    if (change.isError) change.reset()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" aria-label="Change password">
      <h3 className="text-sm font-medium">Change password</h3>
      {error && error.code !== 'wrong_password' && (
        <Alert variant="destructive"><AlertDescription>{error.fieldErrors.new_password ?? error.message}</AlertDescription></Alert>
      )}
      <FormField id="current_password" label="Current password"
        error={error?.code === 'wrong_password' ? error.message : undefined}>
        <PasswordInput id="current_password" autoComplete="current-password" required maxLength={128}
          aria-invalid={error?.code === 'wrong_password'}
          value={current} onChange={(event) => { setCurrent(event.target.value); reset() }} />
      </FormField>
      <FormField id="new_password" label="New password" hint="At least 8 characters.">
        <PasswordInput id="new_password" autoComplete="new-password" required minLength={8} maxLength={128}
          value={next} onChange={(event) => { setNext(event.target.value); reset() }} />
      </FormField>
      <FormField id="repeat_password" label="Repeat the new password"
        error={mismatch ? 'The two passwords are not the same' : undefined}>
        <PasswordInput id="repeat_password" autoComplete="new-password" required maxLength={128}
          aria-invalid={mismatch}
          value={repeat} onChange={(event) => { setRepeat(event.target.value); reset() }} />
      </FormField>
      <Button type="submit" variant="outline" className="self-start" disabled={change.isPending}>
        {change.isPending && <Spinner />}
        Change password
      </Button>
    </form>
  )
}
