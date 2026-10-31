import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatShare } from '@/lib/format'
import type { AccuracyReport } from '@/lib/forecasts-api'

export function AccuracyCard({ accuracy }: { accuracy: AccuracyReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How accurate is it?</CardTitle>
        <CardDescription>
          Both models were tested on your last 4 weeks. Each one saw only the days before a week,
          predicted that week, and was compared with what really sold.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="rounded-lg border">
          <Table>
            <TableCaption className="sr-only">Error of each forecasting model</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Error per day</TableHead>
                <TableHead className="text-right">Error per week</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accuracy.models.map((model) => (
                <TableRow key={model.method}>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{model.method}</span>
                      {model.method === accuracy.chosen && <Badge variant="secondary">Used</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatShare(model.daily_wape)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatShare(model.weekly_wape)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
          <li>The error is a share of what was sold: 25% means off by 25 for every 100 sold.</li>
          <li>
            The weekly number decides which model is used, because orders are made for a week, and
            on a single day chance plays a big part in a small store.
          </li>
          <li>These are simple statistical models, not machine learning yet.</li>
          <li>
            A day when a product was sold out counts as a day without demand, so products that often
            run out may be forecast too low.
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
