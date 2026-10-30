import type { ReactNode } from 'react'
import { createBrowserRouter } from 'react-router'

import { GuestOnly, RequireAuth } from '@/auth/route-guards'
import { AppLayout } from '@/components/layout/app-layout'
import { AuthLayout } from '@/components/layout/auth-layout'
import { ALL_NAV_ITEMS } from '@/config/navigation'
import { ForgotPasswordPage } from '@/pages/auth/forgot-password-page'
import { LoginPage } from '@/pages/auth/login-page'
import { RegisterPage } from '@/pages/auth/register-page'
import { ResetPasswordPage } from '@/pages/auth/reset-password-page'
import { VerifyEmailPage } from '@/pages/auth/verify-email-page'
import { InventoryPage } from '@/pages/inventory/inventory-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { PlannedPage } from '@/pages/planned-page'
import { ProductsPage } from '@/pages/products/products-page'

// Modules that are already built. Every other menu item shows a "Planned" placeholder.
const BUILT_PAGES: Record<string, ReactNode> = {
  '/products': <ProductsPage />,
  '/inventory': <InventoryPage />,
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
            element: BUILT_PAGES[item.path] ?? <PlannedPage item={item} />,
          })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
