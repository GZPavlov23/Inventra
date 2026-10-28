import { createContext } from 'react'

import type { CurrentUser } from '@/lib/auth-api'

// "loading" lasts only until the first /me answer arrives, so the app never flashes the login
// page for a user who is in fact logged in.
export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: CurrentUser }

export type AuthContextValue = {
  state: AuthState
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
