import { useContext } from 'react'

import { AuthContext } from '@/auth/auth-context'

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
