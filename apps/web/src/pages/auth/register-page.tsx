import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'

import { AuthCard } from '@/components/auth/auth-card'
import { CheckEmailCard } from '@/components/auth/check-email-card'
import { PasswordInput } from '@/components/auth/password-input'
import { PasswordStrengthMeter } from '@/components/auth/password-strength-meter'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { type ApiError, toApiError } from '@/lib/api'
import { authApi, type RegisterData } from '@/lib/auth-api'
import { useT } from '@/i18n/language-context'

const EMPTY_FORM: RegisterData = { full_name: '', store_name: '', email: '', password: '' }

export function RegisterPage() {
  const t = useT()
  useDocumentTitle(t.auth.createAccountLink)
  const [form, setForm] = useState<RegisterData>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const update = (field: keyof RegisterData) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await authApi.register(form)
      setSentTo(form.email)
    } catch (caught) {
      setError(toApiError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <CheckEmailCard>{t.auth.registerSent(sentTo)}</CheckEmailCard>
    )
  }

  return (
    <AuthCard shakeKey={error}>
      <CardHeader data-animate>
        <CardTitle className="text-3xl font-semibold tracking-tight">{t.auth.registerTitle}</CardTitle>
        <CardDescription className="text-base">{t.auth.registerSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          <div data-animate className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="full_name">{t.auth.yourName}</Label>
              <Input id="full_name" autoComplete="name" required maxLength={120}
                value={form.full_name} onChange={update('full_name')} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="store_name">{t.auth.storeName}</Label>
              <Input id="store_name" autoComplete="organization" required maxLength={120}
                value={form.store_name} onChange={update('store_name')} />
            </div>
          </div>
          <div data-animate className="flex flex-col gap-2">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input id="email" type="email" autoComplete="email" required placeholder={t.auth.emailPlaceholder}
              value={form.email} onChange={update('email')} />
          </div>
          <div data-animate className="flex flex-col gap-2">
            <Label htmlFor="password">{t.auth.password}</Label>
            <PasswordInput id="password" autoComplete="new-password" required
              minLength={8} maxLength={128} aria-describedby="password-hint"
              value={form.password} onChange={update('password')} />
            <PasswordStrengthMeter password={form.password} email={form.email} />
            <p id="password-hint" className="text-xs text-muted-foreground">{t.auth.passwordHint}</p>
          </div>

          <Button data-animate type="submit" disabled={submitting} className="mt-1">
            {submitting && <Spinner />}
            {t.auth.createAccount}
          </Button>
        </form>

        <p data-animate className="mt-6 text-center text-sm text-muted-foreground">
          {t.auth.haveAccount}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t.auth.logIn}
          </Link>
        </p>
      </CardContent>
    </AuthCard>
  )
}
