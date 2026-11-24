import { Link, NavLink } from 'react-router'

import logoMark from '@/assets/logo-mark.png'
import { useCan } from '@/auth/use-auth'
import { UserMenu } from '@/components/layout/user-menu'
import { QuickSearch } from '@/components/quick-search/quick-search'
import { APP_NAME } from '@/config/app'
import { NAV_GROUPS } from '@/config/navigation'
import { useT } from '@/i18n/language-context'
import { LanguageToggle } from '@/components/layout/language-toggle'

// One calm bar across the top: the logo, the pages this role can use as a row of pills, and the
// person on the right. The store's name, Settings and logging out live in the person's menu: a
// store's name can be any length, and next to the logo a long one pushed the pills aside.
export function AppHeader() {
  const can = useCan()
  const t = useT()
  const items = NAV_GROUPS.flatMap((group) => group.items).filter((item) => !item.requires || can(item.requires))

  return (
    <header data-slot="app-header" className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          {/* Empty alt: the name next to it already labels the link. */}
          <img src={logoMark} alt="" className="size-8 shrink-0" />
          <span className="font-heading text-xl font-bold">{APP_NAME}</span>
        </Link>

        {/* Below 1280px the pills get a row of their own (scrolling sideways on a phone):
            in Bulgarian they are too long to share one with the logo and the buttons. */}
        <nav aria-label={t.nav.main} className="order-last -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 md:-mx-6 md:w-[calc(100%+3rem)] md:px-6 xl:order-none xl:mx-0 xl:w-auto xl:flex-1 xl:px-0">
          <ul className="flex w-max gap-1 rounded-full bg-secondary p-1">
            {items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `block rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(120_80_30/0.12)]'
                        : 'text-muted-foreground hover:text-foreground'
                    }`
                  }
                >
                  {t.nav[item.key]}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:ml-0">
          <QuickSearch />
          <LanguageToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
