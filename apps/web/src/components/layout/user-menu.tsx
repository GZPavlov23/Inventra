import { ChevronDown, LogOut, Settings } from 'lucide-react'
import { Link } from 'react-router'

import { useAuth, useCurrentUser } from '@/auth/use-auth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ThemeChoice } from '@/theme/theme'
import { useTheme } from '@/theme/use-theme'
import { useT } from '@/i18n/language-context'

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

// The logged-in person on the right of the top bar: their settings and the way out.
export function UserMenu() {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const [theme, setTheme] = useTheme()
  const t = useT()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Just the initials on screen; the name is still read out, and shown inside the menu. */}
        <button
          type="button"
          aria-label={t.header.account(user.full_name)}
          className="flex items-center gap-1 rounded-full py-1 pr-1.5 pl-1 outline-offset-2 hover:bg-secondary"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-good text-xs font-extrabold text-primary-foreground">{initials(user.full_name)}</AvatarFallback>
          </Avatar>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-bold">{user.full_name}</div>
          <div data-slot="menu-store" className="text-xs text-muted-foreground">
            {t.roles[user.role]} · {user.store.name}
          </div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings"><Settings />{t.nav.settings}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-bold text-muted-foreground">{t.header.theme}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as ThemeChoice)}>
          <DropdownMenuRadioItem value="system">{t.header.themeSystem}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">{t.header.themeLight}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t.header.themeDark}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut />
          {t.header.logOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
