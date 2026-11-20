import { Link, NavLink } from 'react-router'

import logoMark from '@/assets/logo-mark.png'
import { useCan } from '@/auth/use-auth'
import { UserMenu } from '@/components/layout/user-menu'
import { QuickSearch } from '@/components/quick-search/quick-search'
import { APP_NAME } from '@/config/app'
import { NAV_GROUPS } from '@/config/navigation'

// One calm bar across the top: the logo, the pages this role can use as a row of pills, and the
// person on the right. The store's name, Settings and logging out live in the person's menu: a
// store's name can be any length, and next to the logo a long one pushed the pills aside.
export function AppHeader() {
  const can = useCan()
  const items = NAV_GROUPS.flatMap((group) => group.items).filter((item) => !item.requires || can(item.requires))

  return (
    <header data-slot="app-header" className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          {/* Empty alt: the name next to it already labels the link. */}
          <img src={logoMark} alt="" className="size-8 shrink-0" />
          <span className="font-heading text-xl font-bold">{APP_NAME}</span>
        </Link>

        {/* On a phone the pills get a row of their own and scroll sideways. */}
        <nav aria-label="Main" className="order-last -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 md:order-none md:mx-0 md:w-auto md:flex-1 md:px-0">
          <ul className="flex w-max gap-1 rounded-full bg-secondary p-1">
            {items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `block rounded-full px-3.5 py-1.5 text-sm font-bold whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(120_80_30/0.12)]'
                        : 'text-muted-foreground hover:text-foreground'
                    }`
                  }
                >
                  {item.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <QuickSearch />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
