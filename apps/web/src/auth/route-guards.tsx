import { Navigate, Outlet, useLocation } from 'react-router'

import { useAuth } from '@/auth/use-auth'
import { Spinner } from '@/components/ui/spinner'

type RedirectState = { from?: string } | null

// Wraps every page of the platform: visitors who are not logged in go to /login.
// This is about user experience; the real protection is the API, which answers 401 to them.
export function RequireAuth() {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'anonymous') {
    // Remember the page they wanted, to return there right after logging in.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

// Wraps /login and /register: someone who is already logged in has nothing to do there.
export function GuestOnly() {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'authenticated') {
    const from = (location.state as RedirectState)?.from ?? '/'
    return <Navigate to={from} replace />
  }
  return <Outlet />
}

function FullPageSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center" aria-label="Loading">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  )
}
