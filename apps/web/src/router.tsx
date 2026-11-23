import type { ReactNode } from 'react'
import { createBrowserRouter } from 'react-router'

import { GuestOnly, RequireAuth } from '@/auth/route-guards'
import { RoleGate } from '@/auth/role-gate'
import { AppLayout } from '@/components/layout/app-layout'
import { AuthLayout } from '@/components/layout/auth-layout'
import { ALL_NAV_ITEMS } from '@/config/navigation'
import { AcceptInvitationPage } from '@/pages/auth/accept-invitation-page'
import { ForgotPasswordPage } from '@/pages/auth/forgot-password-page'
import { LoginPage } from '@/pages/auth/login-page'
import { RegisterPage } from '@/pages/auth/register-page'
import { ResetPasswordPage } from '@/pages/auth/reset-password-page'
import { VerifyEmailPage } from '@/pages/auth/verify-email-page'
import { DashboardPage } from '@/pages/dashboard/dashboard-page'
import { DeliveriesPage } from '@/pages/deliveries/deliveries-page'
import { ForecastPage } from '@/pages/forecast/forecast-page'
import { InventoryPage } from '@/pages/inventory/inventory-page'
import { MonthPage } from '@/pages/month/month-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { OrdersPage } from '@/pages/orders/orders-page'
import { PlannedPage } from '@/pages/planned-page'
import { ProductStoryPage } from '@/pages/products/product-story-page'
import { ProductsPage } from '@/pages/products/products-page'
import { SalesPage } from '@/pages/sales/sales-page'
import { SettingsPage } from '@/pages/settings/settings-page'
import { SuppliersPage } from '@/pages/suppliers/suppliers-page'

// Modules that are already built. Every other menu item shows a "Planned" placeholder.
const BUILT_PAGES: Record<string, ReactNode> = {
  '/': <DashboardPage />,
  '/products': <ProductsPage />,
  '/inventory': <InventoryPage />,
  '/deliveries': <DeliveriesPage />,
  '/suppliers': <SuppliersPage />,
  '/sales': <SalesPage />,
  '/forecast': <ForecastPage />,
  '/orders': <OrdersPage />,
  '/month': <MonthPage />,
  '/settings': <SettingsPage />,
}

export const router = createBrowserRouter([
  {
    // Pages for visitors who are not logged in.
    element: <AuthLayout />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // Opened from email links, whether or not someone is logged in.
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/accept-invitation', element: <AcceptInvitationPage /> },
    ],
  },
  {
    // The platform itself: everything here requires a logged-in user.
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          ...ALL_NAV_ITEMS.map((item) => ({
            path: item.path,
            element: <RoleGate item={item}>{BUILT_PAGES[item.path] ?? <PlannedPage item={item} />}</RoleGate>,
          })),
          // One product's story. Everyone who sees Products sees it, so no role gate.
          { path: '/products/:productId', element: <ProductStoryPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
