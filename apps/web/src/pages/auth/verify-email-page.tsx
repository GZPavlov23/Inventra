import { CircleCheck, CircleX } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { AuthCard } from '@/components/auth/auth-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { toApiError } from '@/lib/api'
import { authApi } from '@/lib/auth-api'
import { useT } from '@/i18n/language-context'

type Status = { kind: 'verifying' } | { kind: 'success' } | { kind: 'error'; message: string }

// Opened from the link in the confirmation email: /verify-email?token=...
export function VerifyEmailPage() {
  const t = useT()
  useDocumentTitle(t.auth.verifyTitle)
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>(
    token ? { kind: 'verifying' } : { kind: 'error', message: t.auth.noToken },
  )
  // The token works only once. React's StrictMode runs effects twice in development,
  // so this guard makes sure we send it a single time.
  const sent = useRef(false)

  useEffect(() => {
    if (!token || sent.current) return
    sent.current = true
    authApi
      .verifyEmail(token)
      .then(() => setStatus({ kind: 'success' }))
      .catch((caught) => setStatus({ kind: 'error', message: toApiError(caught).message }))
  }, [token])

  if (status.kind === 'verifying') {
    return (
      <AuthCard animationKey="verifying">
        <CardContent className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Spinner /> {t.auth.verifying}
        </CardContent>
      </AuthCard>
    )
  }

  if (status.kind === 'success') {
    return (
      <AuthCard animationKey="success">
        <CardHeader>
          <CircleCheck data-pop className="mb-2 size-9 text-good" />
          <CardTitle className="text-3xl font-semibold tracking-tight">{t.auth.emailConfirmed}</CardTitle>
          <CardDescription className="text-base">{t.auth.accountActive}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button data-animate asChild className="w-full">
            <Link to="/login">{t.auth.logIn}</Link>
          </Button>
        </CardContent>
      </AuthCard>
    )
  }

  return (
    <AuthCard animationKey="error">
      <CardHeader>
        <CircleX data-pop className="mb-2 size-9 text-destructive" />
        <CardTitle className="text-3xl font-semibold tracking-tight">{t.auth.linkDidNotWork}</CardTitle>
        <CardDescription className="text-base">{status.message}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ResendLinkForm />
        <Button data-animate asChild variant="outline">
          <Link to="/login">{t.auth.backToLogIn}</Link>
        </Button>
      </CardContent>
    </AuthCard>
  )
}

function ResendLinkForm() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await authApi.resendVerification(email)
      setMessage(t.auth.newLinkSent)
    } catch (caught) {
      setMessage(toApiError(caught).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form data-animate onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor="email">{t.auth.getNewLink}</Label>
      <div className="flex gap-2">
        <Input id="email" type="email" autoComplete="email" required placeholder={t.auth.emailPlaceholder}
          value={email} onChange={(event) => setEmail(event.target.value)} />
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner />}
          {t.auth.send}
        </Button>
      </div>
      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
