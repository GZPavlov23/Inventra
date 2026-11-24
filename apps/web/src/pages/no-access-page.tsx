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
import { useT } from '@/i18n/language-context'

// For an address opened directly, by someone whose role doesn't include that page.
export function NoAccessPage({ item, startPath }: { item: NavItem; startPath: string }) {
  const t = useT()
  return (
    <Empty className="rounded-2xl bg-card shadow-soft">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Lock /></EmptyMedia>
        <EmptyTitle>{t.pages.noAccessTitle(t.nav[item.key])}</EmptyTitle>
        <EmptyDescription>{t.pages.noAccessText}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" asChild><Link to={startPath}>{t.pages.goToStart}</Link></Button>
      </EmptyContent>
    </Empty>
  )
}
