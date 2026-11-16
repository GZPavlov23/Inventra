import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useCan } from '@/auth/use-auth'
import type { NavItem } from '@/config/navigation'
import { NoAccessPage } from '@/pages/no-access-page'

// Pages the role doesn't include: the start page sends people to where their day begins,
// the others explain instead of showing a page whose every request the API would refuse.
export function RoleGate({ item, children }: { item: NavItem; children: ReactNode }) {
  const can = useCan()
  if (!item.requires || can(item.requires)) return children
  const startPath = can('see_finances') ? '/' : '/inventory'
  if (item.path === '/') return <Navigate to={startPath} replace />
  return <NoAccessPage item={item} startPath={startPath} />
}
