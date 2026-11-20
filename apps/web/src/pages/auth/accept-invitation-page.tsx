import { CircleCheck, CircleX } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useAuth } from '@/auth/use-auth'
import { AuthCard } from '@/components/auth/auth-card'
import { PasswordInput } from '@/components/auth/password-input'
import { PasswordStrengthMeter } from '@/components/auth/password-strength-meter'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { ApiError, toApiError } from '@/lib/api'
import { authApi } from '@/lib/auth-api'

// Opened from the link in an invitation email: /accept-invitation?token=...
export function AcceptInvitationPage() {
  useDocumentTitle('Join your store')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { state, logout } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirmation) {
      setError(new ApiError(0, 'mismatch', 'The two passwords are not the same'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await authApi.acceptInvitation(token!, password)
      // Someone else may be logged in on this browser, the owner who sent the link for example.
      if (state.status === 'authenticated') await logout()
      setDone(true)
    } catch (caught) {
      setError(toApiError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <AuthCard animationKey="done">
        <CardHeader>
          <CircleCheck data-pop className="mb-2 size-9 text-good" />
          <CardTitle className="text-3xl font-semibold tracking-tight">You're in</CardTitle>
          <CardDescription className="text-base">
            Your account is ready. Log in with your email and the password you just chose.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button data-animate asChild className="w-full">
            <Link to="/login">Log in</Link>
          </Button>
        </CardContent>
      </AuthCard>
    )
  }

  if (!token || error?.code === 'invalid_token') {
    return (
      <AuthCard animationKey="invalid">
        <CardHeader>
          <CircleX data-pop className="mb-2 size-9 text-destructive" />
          <CardTitle className="text-3xl font-semibold tracking-tight">The link did not work</CardTitle>
          <CardDescription className="text-base">
            {error?.message ?? 'This link has no token.'} An invitation works once, for 7 days. The
            store's owner can send you a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button data-animate asChild variant="outline" className="w-full">
            <Link to="/login">Back to log in</Link>
          </Button>
        </CardContent>
      </AuthCard>
    )
  }

  return (
    <AuthCard shakeKey={error}>
      <CardHeader data-animate>
        <CardTitle className="text-3xl font-semibold tracking-tight">Join your store</CardTitle>
        <CardDescription className="text-base">
          You were invited to Inventra. Choose a password to finish setting up your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          <div data-animate className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" autoComplete="new-password" required minLength={8}
              maxLength={128} aria-describedby="password-hint"
              value={password} onChange={(event) => setPassword(event.target.value)} />
            <PasswordStrengthMeter password={password} />
            <p id="password-hint" className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <div data-animate className="flex flex-col gap-2">
            <Label htmlFor="confirmation">Repeat the password</Label>
            <PasswordInput id="confirmation" autoComplete="new-password" required maxLength={128}
              value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </div>
          <Button data-animate type="submit" disabled={submitting} className="mt-1">
            {submitting && <Spinner />}
            Join the store
          </Button>
        </form>
      </CardContent>
    </AuthCard>
  )
}
