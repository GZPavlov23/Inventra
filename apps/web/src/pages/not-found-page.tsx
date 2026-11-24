import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/language-context'

export function NotFoundPage() {
  const t = useT()
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h2 className="text-2xl font-semibold">{t.pages.notFoundTitle}</h2>
      <p className="text-muted-foreground">{t.pages.notFoundText}</p>
      <Button asChild variant="outline">
        <Link to="/">
          <ArrowLeft />
          {t.pages.backToDashboard}
        </Link>
      </Button>
    </div>
  )
}
