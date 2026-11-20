import { Outlet, useLocation } from 'react-router'

import { AppHeader } from '@/components/layout/app-header'
import { PageTransition } from '@/components/layout/page-transition'
import { FloatingNewSale } from '@/components/new-sale/floating-new-sale'
import { NewSaleProvider } from '@/components/new-sale/new-sale-provider'
import { ALL_NAV_ITEMS, isActivePath } from '@/config/navigation'
import { useDocumentTitle } from '@/hooks/use-document-title'

// The frame around every page: the top bar, then the page in a calm centred column.
export function AppLayout() {
  const { pathname } = useLocation()
  const title = ALL_NAV_ITEMS.find((item) => isActivePath(item.path, pathname))?.title ?? 'Page not found'

  useDocumentTitle(title)

  return (
    <NewSaleProvider>
      <div className="min-h-svh bg-background">
        <AppHeader />
        {/* min-w-0: a wide table scrolls inside its frame instead of widening the whole page.
            The extra room at the bottom keeps the last row clear of the floating button. */}
        <main className="mx-auto max-w-6xl min-w-0 px-4 pt-6 pb-24 md:px-6 md:pt-8">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
        <FloatingNewSale />
      </div>
    </NewSaleProvider>
  )
}
