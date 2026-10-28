import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { AuthContext, type AuthState } from '@/auth/auth-context'
import { UNAUTHORIZED_EVENT } from '@/lib/api'
import { authApi } from '@/lib/auth-api'
import { queryClient } from '@/lib/query-client'

// Knows who is logged in and shares it with the whole app.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    // The session cookie is httpOnly, so JavaScript can't look at it; asking the server is the
    // only way to know whether we are logged in.
    authApi
      .me()
      .then((user) => !cancelled && setState({ status: 'authenticated', user }))
      .catch(() => !cancelled && setState({ status: 'anonymous' }))

    // Any 401 later on (e.g. the session expired) sends the user back to the login page.
    const handleUnauthorized = () => {
      queryClient.clear()
      setState({ status: 'anonymous' })
    }
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => {
      cancelled = true
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const user = await authApi.login(email, password)
    // Start with an empty cache, so nothing from a previous user on this browser is shown.
    queryClient.clear()
    setState({ status: 'authenticated', user })
  }, [])

  const logout = useCallback(async () => {
    // Even if the request fails (e.g. offline), the user is logged out on this screen.
    await authApi.logout().catch(() => undefined)
    // Forget every store's data that was cached in this browser.
    queryClient.clear()
    setState({ status: 'anonymous' })
  }, [])

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout])
  return <AuthContext value={value}>{children}</AuthContext>
}
