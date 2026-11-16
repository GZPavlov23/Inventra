import { api } from '@/lib/api'

// Shapes match the backend schemas in apps/api/app/schemas/auth.py.

export type UserRole = 'owner' | 'manager' | 'staff'

// Matches app/core/permissions.py. The API checks every request; the web app only uses these
// to leave out what a role can't use.
export type Permission = 'sell' | 'handle_stock' | 'manage_catalog' | 'plan' | 'see_finances' | 'manage_team'

export const ROLE_LABELS: Record<UserRole, string> = { owner: 'Owner', manager: 'Manager', staff: 'Staff' }

export type CurrentUser = {
  id: number
  email: string
  full_name: string
  role: UserRole
  permissions: Permission[]
  store: { id: number; name: string; currency: string }
}

export type RegisterData = {
  full_name: string
  email: string
  password: string
  store_name: string
}

type Message = { detail: string }

export const authApi = {
  me: () => api<CurrentUser>('/me'),
  login: (email: string, password: string) =>
    api<CurrentUser>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  register: (data: RegisterData) => api<Message>('/auth/register', { method: 'POST', body: data }),
  verifyEmail: (token: string) =>
    api<Message>('/auth/verify-email', { method: 'POST', body: { token } }),
  resendVerification: (email: string) =>
    api<Message>('/auth/resend-verification', { method: 'POST', body: { email } }),
  forgotPassword: (email: string) =>
    api<Message>('/auth/forgot-password', { method: 'POST', body: { email } }),
  acceptInvitation: (token: string, password: string) =>
    api<Message>('/auth/accept-invitation', { method: 'POST', body: { token, password } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<Message>('/auth/change-password', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword },
    }),
  resetPassword: (token: string, newPassword: string) =>
    api<Message>('/auth/reset-password', {
      method: 'POST',
      body: { token, new_password: newPassword },
    }),
}
