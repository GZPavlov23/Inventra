import { useContext } from 'react'

import { AuthContext } from '@/auth/auth-context'
import type { Permission } from '@/lib/auth-api'

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === null) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

// For components that are only ever shown to logged-in users (inside <RequireAuth>).
export function useCurrentUser() {
  const { state } = useAuth()
  if (state.status !== 'authenticated') throw new Error('useCurrentUser needs a logged-in user')
  return state.user
}

// can('plan') is true when the logged-in user's role may plan. Only for leaving things out of
// the screen: the API refuses anything the role may not do, whatever the screen shows.
export function useCan() {
  const user = useCurrentUser()
  return (permission: Permission) => user.permissions.includes(permission)
}
