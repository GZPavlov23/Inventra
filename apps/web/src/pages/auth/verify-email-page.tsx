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

type Status = { kind: 'verifying' } | { kind: 'success' } | { kind: 'error'; message: string }

// Opened from the link in the confirmation email: /verify-email?token=...
export function VerifyEmailPage() {
  useDocumentTitle('Confirm email')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>(
    token ? { kind: 'verifying' } : { kind: 'error', message: 'This link has no token.' },
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
          <Spinner /> Confirming your email…
        </CardContent>
      </AuthCard>
    )
  }

  if (status.kind === 'success') {
    return (
      <AuthCard animationKey="success">
        <CardHeader>
          <CircleCheck data-pop className="mb-2 size-9 text-primary" />
          <CardTitle className="text-3xl font-semibold tracking-tight">Email confirmed</CardTitle>
          <CardDescription className="text-base">Your account is active. You can log in now.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button data-animate asChild className="w-full">
            <Link to="/login">Log in</Link>
          </Button>
        </CardContent>
      </AuthCard>
    )
  }

  return (
    <AuthCard animationKey="error">
      <CardHeader>
        <CircleX data-pop className="mb-2 size-9 text-destructive" />
        <CardTitle className="text-3xl font-semibold tracking-tight">The link did not work</CardTitle>
        <CardDescription className="text-base">{status.message}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ResendLinkForm />
        <Button data-animate asChild variant="outline">
          <Link to="/login">Back to log in</Link>
        </Button>
      </CardContent>
    </AuthCard>
  )
}

function ResendLinkForm() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      setMessage((await authApi.resendVerification(email)).detail)
    } catch (caught) {
      setMessage(toApiError(caught).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form data-animate onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor="email">Get a new link</Label>
      <div className="flex gap-2">
        <Input id="email" type="email" autoComplete="email" required placeholder="you@example.com"
          value={email} onChange={(event) => setEmail(event.target.value)} />
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner />}
          Send
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
