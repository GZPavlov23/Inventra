import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'

import { AuthCard } from '@/components/auth/auth-card'
import { CheckEmailCard } from '@/components/auth/check-email-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { type ApiError, toApiError } from '@/lib/api'
import { authApi } from '@/lib/auth-api'
import { useT } from '@/i18n/language-context'

export function ForgotPasswordPage() {
  const t = useT()
  useDocumentTitle(t.auth.forgotLink)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await authApi.forgotPassword(email)
      setSentTo(email)
    } catch (caught) {
      setError(toApiError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <CheckEmailCard>{t.auth.forgotSent(sentTo)}</CheckEmailCard>
    )
  }

  return (
    <AuthCard shakeKey={error}>
      <CardHeader data-animate>
        <CardTitle className="text-3xl font-semibold tracking-tight">{t.auth.forgotTitle}</CardTitle>
        <CardDescription className="text-base">{t.auth.forgotSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          <div data-animate className="flex flex-col gap-2">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input id="email" type="email" autoComplete="email" required placeholder={t.auth.emailPlaceholder}
              value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <Button data-animate type="submit" disabled={submitting}>
            {submitting && <Spinner />}
            {t.auth.sendResetLink}
          </Button>
        </form>
        <p data-animate className="mt-6 text-center text-sm text-muted-foreground">
          {t.auth.remembered}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t.auth.backToLogIn}
          </Link>
        </p>
      </CardContent>
    </AuthCard>
  )
}
