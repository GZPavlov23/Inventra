import { api } from '@/lib/api'
import type { CurrentUser, UserRole } from '@/lib/auth-api'

// Shapes match the backend schemas in apps/api/app/schemas/team.py.

export type MemberStatus = 'active' | 'invited' | 'deactivated'

export type TeamMember = {
  id: number
  full_name: string
  email: string
  role: UserRole
  status: MemberStatus
  created_at: string
}

export type InvitationInput = {
  email: string
  full_name: string
  role: 'manager' | 'staff'
}

export const teamApi = {
  members: () => api<TeamMember[]>('/team'),
  invite: (data: InvitationInput) =>
    api<TeamMember>('/team/invitations', { method: 'POST', body: data }),
  resend: (id: number) => api<TeamMember>(`/team/${id}/resend-invitation`, { method: 'POST' }),
  update: (id: number, data: { role?: UserRole; active?: boolean }) =>
    api<TeamMember>(`/team/${id}`, { method: 'PATCH', body: data }),
  renameStore: (name: string) =>
    api<CurrentUser['store']>('/store', { method: 'PATCH', body: { name } }),
}
