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
import { useT } from '@/i18n/language-context'

export function AccuracyCard({ accuracy }: { accuracy: AccuracyReport }) {
  const t = useT()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.forecast.accuracyTitle}</CardTitle>
        <CardDescription>
          {t.forecast.accuracyText}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="rounded-2xl bg-card shadow-soft">
          <Table>
            <TableCaption className="sr-only">{t.forecast.accuracyCaption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t.forecast.modelHeading}</TableHead>
                <TableHead className="text-right">{t.forecast.errorPerDay}</TableHead>
                <TableHead className="text-right">{t.forecast.errorPerWeek}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accuracy.models.map((model) => (
                <TableRow key={model.method}>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.common.models[model.method] ?? model.method}</span>
                      {model.method === accuracy.chosen && <Badge variant="secondary">{t.forecast.used}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right figures">{formatShare(model.daily_wape)}</TableCell>
                  <TableCell className="text-right font-medium figures">{formatShare(model.weekly_wape)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
          {t.forecast.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </CardContent>
    </Card>
  )
}
