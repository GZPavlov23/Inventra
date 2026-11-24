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
import { useT } from '@/i18n/language-context'

// Opened from the link in an invitation email: /accept-invitation?token=...
export function AcceptInvitationPage() {
  const t = useT()
  useDocumentTitle(t.auth.joinTitle)
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
      setError(new ApiError(0, 'mismatch', t.auth.passwordsDiffer))
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
          <CardTitle className="text-3xl font-semibold tracking-tight">{t.auth.youreIn}</CardTitle>
          <CardDescription className="text-base">{t.auth.accountReady}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button data-animate asChild className="w-full">
            <Link to="/login">{t.auth.logIn}</Link>
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
          <CardTitle className="text-3xl font-semibold tracking-tight">{t.auth.linkDidNotWork}</CardTitle>
          <CardDescription className="text-base">
            {error ? error.message : t.auth.noToken} {t.auth.invitationRule}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button data-animate asChild variant="outline" className="w-full">
            <Link to="/login">{t.auth.backToLogIn}</Link>
          </Button>
        </CardContent>
      </AuthCard>
    )
  }

  return (
    <AuthCard shakeKey={error}>
      <CardHeader data-animate>
        <CardTitle className="text-3xl font-semibold tracking-tight">{t.auth.joinTitle}</CardTitle>
        <CardDescription className="text-base">{t.auth.joinSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          <div data-animate className="flex flex-col gap-2">
            <Label htmlFor="password">{t.auth.password}</Label>
            <PasswordInput id="password" autoComplete="new-password" required minLength={8}
              maxLength={128} aria-describedby="password-hint"
              value={password} onChange={(event) => setPassword(event.target.value)} />
            <PasswordStrengthMeter password={password} />
            <p id="password-hint" className="text-xs text-muted-foreground">{t.auth.atLeast8}</p>
          </div>
          <div data-animate className="flex flex-col gap-2">
            <Label htmlFor="confirmation">{t.auth.repeatPassword}</Label>
            <PasswordInput id="confirmation" autoComplete="new-password" required maxLength={128}
              value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </div>
          <Button data-animate type="submit" disabled={submitting} className="mt-1">
            {submitting && <Spinner />}
            {t.auth.joinButton}
          </Button>
        </form>
      </CardContent>
    </AuthCard>
  )
}
