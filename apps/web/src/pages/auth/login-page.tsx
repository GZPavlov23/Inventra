import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'

import { useAuth } from '@/auth/use-auth'
import { AuthCard } from '@/components/auth/auth-card'
import { PasswordInput } from '@/components/auth/password-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { DEMO_ACCOUNT } from '@/config/demo'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { type ApiError, toApiError } from '@/lib/api'
import { authApi } from '@/lib/auth-api'
import { useT } from '@/i18n/language-context'

export function LoginPage() {
  const t = useT()
  useDocumentTitle(t.auth.logIn)
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setNotice(null)
    try {
      // On success the auth state changes and <GuestOnly> redirects into the platform.
      await login(email, password)
    } catch (caught) {
      setError(toApiError(caught))
      setSubmitting(false)
    }
  }

  async function resendLink() {
    try {
      await authApi.resendVerification(email)
      setNotice(t.auth.newLinkSent)
      setError(null)
    } catch (caught) {
      setError(toApiError(caught))
    }
  }

  return (
    <AuthCard shakeKey={error}>
      <CardHeader data-animate>
        <CardTitle className="text-3xl font-semibold tracking-tight">{t.auth.loginTitle}</CardTitle>
        <CardDescription className="text-base">{t.auth.loginSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error.message}
                {error.code === 'email_not_verified' && (
                  <Button type="button" variant="link" className="h-auto p-0" onClick={resendLink}>
                    {t.auth.resendConfirmation}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {notice && (
            <Alert>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}

          <div data-animate className="flex flex-col gap-2">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input id="email" type="email" autoComplete="email" required placeholder={t.auth.emailPlaceholder}
              value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div data-animate className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t.auth.password}</Label>
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                {t.auth.forgotLink}
              </Link>
            </div>
            <PasswordInput id="password" autoComplete="current-password" required
              value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>

          <Button data-animate type="submit" disabled={submitting} className="mt-1">
            {submitting && <Spinner />}
            {t.auth.logIn}
          </Button>

          {import.meta.env.DEV && (
            <Button
              data-animate
              type="button"
              variant="outline"
              onClick={() => {
                setEmail(DEMO_ACCOUNT.email)
                setPassword(DEMO_ACCOUNT.password)
              }}
            >
              {t.auth.fillDemo}
            </Button>
          )}
        </form>

        <p data-animate className="mt-6 text-center text-sm text-muted-foreground">
          {t.auth.newHere}{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            {t.auth.createAccountLink}
          </Link>
        </p>
      </CardContent>
    </AuthCard>
  )
}
