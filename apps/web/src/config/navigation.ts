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

import type { Permission } from '@/lib/auth-api'

// One list drives the sidebar, the routes and the page titles,
// so adding a module means adding one entry here.

export type NavItem = {
  title: string
  path: string
  icon: LucideIcon
  description: string
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
        title: 'Dashboard',
        path: '/',
        icon: LayoutDashboard,
        description: 'Stock levels, expiring batches, alerts and forecasts at a glance.',
        requires: 'see_finances',
      },
    ],
  },
  {
    label: 'Stock',
    items: [
      {
        title: 'Products',
        path: '/products',
        icon: Package,
        description: 'The product catalog: names, barcodes, categories and prices.',
      },
      {
        title: 'Inventory',
        path: '/inventory',
        icon: Boxes,
        description: 'Batches with their quantities and expiry dates, and every stock movement.',
      },
      {
        title: 'Deliveries',
        path: '/deliveries',
        icon: Truck,
        description: 'What you ordered from suppliers and what really arrived.',
      },
      {
        title: 'Suppliers',
        path: '/suppliers',
        icon: Building2,
        description: 'The companies you buy from and how to reach them.',
      },
    ],
  },
  {
    label: 'Sales & planning',
    items: [
      {
        title: 'Sales',
        path: '/sales',
        icon: ShoppingCart,
        description: 'Recording sales manually or importing them from a CSV file.',
      },
      {
        title: 'Orders',
        path: '/orders',
        icon: ClipboardList,
        description: 'What to order, how much and why, based on the forecast and your stock.',
        requires: 'plan',
      },
      {
        title: 'Forecast',
        path: '/forecast',
        icon: TrendingUp,
        description: 'Expected sales per product, what will run short, and how accurate the forecast is.',
        requires: 'plan',
      },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = {
  title: 'Settings',
  path: '/settings',
  icon: Settings,
  description: 'Your account, the store and the people who work there.',
}

// Not a pill in the top bar: opened from the dashboard and the quick search.
export const MONTH_ITEM: NavItem = {
  title: 'Your month',
  path: '/month',
  icon: CalendarHeart,
  description: 'The month in short: sold, thrown away, the best product and how it compares.',
  requires: 'see_finances',
}

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((group) => group.items), MONTH_ITEM, SETTINGS_ITEM]

export function isActivePath(itemPath: string, currentPath: string): boolean {
  // "/" would match every page, so the dashboard is active only on an exact match.
  if (itemPath === '/') return currentPath === '/'
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
}
