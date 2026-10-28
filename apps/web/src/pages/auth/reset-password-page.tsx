import { CircleCheck, CircleX } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useAuth } from '@/auth/use-auth'
import { AuthCard } from '@/components/auth/auth-card'
import { PasswordInput } from '@/components/auth/password-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { ApiError, toApiError } from '@/lib/api'
import { authApi } from '@/lib/auth-api'

// Opened from the link in the "reset your password" email: /reset-password?token=...
export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { logout } = useAuth()
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
      await authApi.resetPassword(token!, password)
      // The server ended every session of this account; forget ours on this screen too.
      await logout()
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
          <CircleCheck data-pop className="mb-2 size-9 text-primary" />
          <CardTitle className="text-3xl font-semibold tracking-tight">Password changed</CardTitle>
          <CardDescription className="text-base">
            You were logged out on all devices. Log in with your new password.
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
            {error?.message ?? 'This link has no token.'} Reset links work once, for 1 hour.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button data-animate asChild>
            <Link to="/forgot-password">Get a new link</Link>
          </Button>
          <Button data-animate asChild variant="outline">
            <Link to="/login">Back to log in</Link>
          </Button>
        </CardContent>
      </AuthCard>
    )
  }

  return (
    <AuthCard shakeKey={error}>
      <CardHeader data-animate>
        <CardTitle className="text-3xl font-semibold tracking-tight">Choose a new password</CardTitle>
        <CardDescription className="text-base">After this you will be logged out on all devices.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          <div data-animate className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
            <PasswordInput id="password" autoComplete="new-password" required minLength={8}
              maxLength={128} aria-describedby="password-hint"
              value={password} onChange={(event) => setPassword(event.target.value)} />
            <p id="password-hint" className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <div data-animate className="flex flex-col gap-2">
            <Label htmlFor="confirmation">Repeat the new password</Label>
            <PasswordInput id="confirmation" autoComplete="new-password" required maxLength={128}
              value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </div>
          <Button data-animate type="submit" disabled={submitting} className="mt-1">
            {submitting && <Spinner />}
            Change password
          </Button>
        </form>
      </CardContent>
    </AuthCard>
  )
}
