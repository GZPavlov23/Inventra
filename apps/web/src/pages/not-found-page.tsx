import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h2 className="text-2xl font-semibold">Page not found</h2>
      <p className="text-muted-foreground">This address does not match any page of the platform.</p>
      <Button asChild variant="outline">
        <Link to="/">
          <ArrowLeft />
          Back to dashboard
        </Link>
      </Button>
    </div>
  )
}
