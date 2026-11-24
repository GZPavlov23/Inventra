import { MailCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { AuthCard } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useT } from '@/i18n/language-context'

// Shown after any action that sends an email (registration, forgotten password).
export function CheckEmailCard({ children }: { children: ReactNode }) {
  const t = useT()
  return (
    <AuthCard animationKey="check-email">
      <CardHeader>
        <div data-pop className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MailCheck className="size-5" />
        </div>
        <CardTitle className="text-3xl font-semibold tracking-tight">{t.auth.checkEmail}</CardTitle>
        <CardDescription className="text-base">{children}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button data-animate asChild variant="outline">
          <Link to="/login">{t.auth.backToLogIn}</Link>
        </Button>
      </CardContent>
    </AuthCard>
  )
}
