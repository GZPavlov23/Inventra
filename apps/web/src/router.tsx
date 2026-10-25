import { createBrowserRouter } from 'react-router'

import { AppLayout } from '@/components/layout/app-layout'
import { ALL_NAV_ITEMS } from '@/config/navigation'
import { NotFoundPage } from '@/pages/not-found-page'
import { PlannedPage } from '@/pages/planned-page'

// Every module starts as a PlannedPage; a route switches to its real page once that is built.
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      ...ALL_NAV_ITEMS.map((item) => ({ path: item.path, element: <PlannedPage item={item} /> })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
