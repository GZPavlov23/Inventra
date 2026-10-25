import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { NavItem } from '@/config/navigation'

// Placeholder for modules that are not built yet. It deliberately shows no numbers or charts,
// so nobody mistakes it for working functionality.
export function PlannedPage({ item }: { item: NavItem }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <item.icon className="size-5" />
          </div>
          <CardTitle className="flex items-center gap-2">
            {item.title}
            <Badge variant="secondary">Planned</Badge>
          </CardTitle>
          <CardDescription>{item.description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This module is not built yet. Nothing on this page uses real or sample data.
        </CardContent>
      </Card>
    </div>
  )
}
