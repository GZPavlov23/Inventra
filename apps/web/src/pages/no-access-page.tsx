import { Lock } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import type { NavItem } from '@/config/navigation'

// For an address opened directly, by someone whose role doesn't include that page.
export function NoAccessPage({ item, startPath }: { item: NavItem; startPath: string }) {
  return (
    <Empty className="rounded-2xl bg-card shadow-soft">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Lock /></EmptyMedia>
        <EmptyTitle>{item.title} isn't part of your role</EmptyTitle>
        <EmptyDescription>
          Ask the store's owner if you need it. Everything else in the menu is yours to use.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" asChild><Link to={startPath}>Go to your start page</Link></Button>
      </EmptyContent>
    </Empty>
  )
}
