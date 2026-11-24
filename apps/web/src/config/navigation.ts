import {
  Boxes,
  Building2,
  CalendarHeart,
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  ShoppingCart,
  TrendingUp,
  Truck,
} from 'lucide-react'

import type { Messages } from '@/i18n/en'
import type { Permission } from '@/lib/auth-api'

// One list drives the menu, the routes and the page titles,
// so adding a module means adding one entry here.

export type NavItem = {
  // Its name in t.nav and what it is for in t.navText, so both follow the chosen language.
  key: Exclude<keyof Messages['nav'], 'main'>
  path: string
  icon: LucideIcon
  // Left out of the menu for roles without it. Pages without one are for everyone.
  requires?: Permission
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        key: 'dashboard',
        path: '/',
        icon: LayoutDashboard,
        requires: 'see_finances',
      },
    ],
  },
  {
    label: 'Stock',
    items: [
      {
        key: 'products',
        path: '/products',
        icon: Package,
      },
      {
        key: 'inventory',
        path: '/inventory',
        icon: Boxes,
      },
      {
        key: 'deliveries',
        path: '/deliveries',
        icon: Truck,
      },
      {
        key: 'suppliers',
        path: '/suppliers',
        icon: Building2,
      },
    ],
  },
  {
    label: 'Sales & planning',
    items: [
      {
        key: 'sales',
        path: '/sales',
        icon: ShoppingCart,
      },
      {
        key: 'orders',
        path: '/orders',
        icon: ClipboardList,
        requires: 'plan',
      },
      {
        key: 'forecast',
        path: '/forecast',
        icon: TrendingUp,
        requires: 'plan',
      },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = {
  key: 'settings',
  path: '/settings',
  icon: Settings,
}

// Not a pill in the top bar: opened from the dashboard and the quick search.
export const MONTH_ITEM: NavItem = {
  key: 'month',
  path: '/month',
  icon: CalendarHeart,
  requires: 'see_finances',
}

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((group) => group.items), MONTH_ITEM, SETTINGS_ITEM]

export function isActivePath(itemPath: string, currentPath: string): boolean {
  // "/" would match every page, so the dashboard is active only on an exact match.
  if (itemPath === '/') return currentPath === '/'
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
}
