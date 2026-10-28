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
import { NotFoundPage } from '@/pages/not-found-page'
import { PlannedPage } from '@/pages/planned-page'

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
    // Every module starts as a PlannedPage; a route switches to its real page once that is built.
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          ...ALL_NAV_ITEMS.map((item) => ({ path: item.path, element: <PlannedPage item={item} /> })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
