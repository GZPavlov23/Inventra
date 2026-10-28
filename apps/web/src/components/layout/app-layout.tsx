import { Outlet, useLocation } from 'react-router'

import { AppSidebar } from '@/components/layout/app-sidebar'
import { PageTransition } from '@/components/layout/page-transition'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { ALL_NAV_ITEMS, isActivePath } from '@/config/navigation'
import { useDocumentTitle } from '@/hooks/use-document-title'

// The frame around every page: sidebar on the left, top bar, and the page content.
export function AppLayout() {
  const { pathname } = useLocation()
  const title = ALL_NAV_ITEMS.find((item) => isActivePath(item.path, pathname))?.title ?? 'Page not found'

  useDocumentTitle(title)

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-center" />
          <h1 className="text-sm font-medium">{title}</h1>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
