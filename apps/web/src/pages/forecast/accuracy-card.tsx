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
          All models were tested on your last 4 weeks. Each one saw only the days before a week,
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
          <li>
            The machine learning model was trained on public sales data of fresh food, not on your
            store. It is used only if it beats the simple models on your own sales.
          </li>
          <li>
            Days when a product was sold out aren't part of the test, because their sales show how
            much stock there was, not how much people wanted. The simple models still take such a
            day for low demand. The machine learning model knows the difference.
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
