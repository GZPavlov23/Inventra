import { ChevronsUpDown, LogOut } from 'lucide-react'

import { useAuth, useCurrentUser } from '@/auth/use-auth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'

const ROLE_LABELS = { owner: 'Owner', manager: 'Manager', staff: 'Staff' } as const

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

// The logged-in user at the bottom of the sidebar, with the log out action.
export function UserMenu() {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const { isMobile } = useSidebar()

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton size="lg" tooltip={user.full_name}>
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-medium text-primary">
                {initials(user.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.full_name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={isMobile ? 'top' : 'right'} align="end" className="min-w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium">{user.full_name}</div>
            <div className="text-xs text-muted-foreground">
              {ROLE_LABELS[user.role]} · {user.store.name}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void logout()}>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}
