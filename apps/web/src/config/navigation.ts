import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
} from 'lucide-react'

// One list drives the sidebar, the routes and the page titles,
// so adding a module means adding one entry here.

export type NavItem = {
  title: string
  path: string
  icon: LucideIcon
  description: string
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
        description: 'Receiving deliveries from suppliers into new batches.',
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
        description: 'Replenishment lists for suppliers, based on the recommendations.',
      },
      {
        title: 'AI Insights',
        path: '/ai-insights',
        icon: Sparkles,
        description: 'Demand forecasts and explainable order recommendations.',
      },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = {
  title: 'Settings',
  path: '/settings',
  icon: Settings,
  description: 'Store details, users and roles.',
}

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((group) => group.items), SETTINGS_ITEM]

export function isActivePath(itemPath: string, currentPath: string): boolean {
  // "/" would match every page, so the dashboard is active only on an exact match.
  if (itemPath === '/') return currentPath === '/'
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
}
