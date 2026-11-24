import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, Download, FileUp } from 'lucide-react'
import { type ChangeEvent, type ReactNode, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useCurrentUser } from '@/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toApiError } from '@/lib/api'
import { formatDay, formatMoney } from '@/lib/format'
import {
  downloadTemplate,
  type ImportMode,
  importsApi,
  MAX_FILE_BYTES,
  readTextFile,
  type SalesImportReport,
} from '@/lib/imports-api'
import { useT } from '@/i18n/language-context'
import { serverText } from '@/i18n/server-text'

const MODES: ImportMode[] = ['current', 'history']

export function ImportDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.sales.importTitle}</DialogTitle>
          <DialogDescription>
            {t.sales.importText}
          </DialogDescription>
        </DialogHeader>
        <ImportForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ImportForm({ onClose }: { onClose: () => void }) {
  const { store } = useCurrentUser()
  const t = useT()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<ImportMode>('current')
  const [file, setFile] = useState<{ name: string; content: string } | null>(null)
  const [fileProblem, setFileProblem] = useState<string | null>(null)

  const check = useMutation({
    mutationFn: ({ mode, content }: { mode: ImportMode; content: string }) =>
      importsApi.sales(mode, content, true),
  })

  const save = useMutation({
    mutationFn: (content: string) => importsApi.sales(mode, content, false),
    onSuccess: (report) => {
      // Refused after all, because something changed since the check: show why.
      if (!report.applied) return
      void queryClient.invalidateQueries({ queryKey: ['sales'] })
      void queryClient.invalidateQueries({ queryKey: ['batches'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(t.sales.imported(report.rows))
      onClose()
    },
  })

  const startOver = () => {
    check.reset()
    save.reset()
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0]
    // Cleared, so choosing the same file again after fixing it still counts as a choice.
    event.target.value = ''
    if (!chosen) return

    startOver()
    setFile(null)
    if (chosen.size > MAX_FILE_BYTES) {
      setFileProblem(t.sales.tooBig)
      return
    }
    setFileProblem(null)
    const content = await readTextFile(chosen)
    setFile({ name: chosen.name, content })
    check.mutate({ mode, content })
  }

  const changeMode = (value: string) => {
    const next = value as ImportMode
    setMode(next)
    startOver()
    if (file) check.mutate({ mode: next, content: file.content })
  }

  const report = save.data ?? check.data
  const failure = save.error ?? check.error
  const busy = check.isPending || save.isPending
  const ready = file !== null && report !== undefined && report.error_count === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Tabs value={mode} onValueChange={changeMode}>
          <TabsList>
            {MODES.map((value) => (
              <TabsTrigger key={value} value={value}>{t.sales.modes[value]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          {t.sales.modeTexts[mode]}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          aria-label={t.sales.csvFile}
          className="sr-only"
          onChange={(event) => void chooseFile(event)}
        />
        <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
          <FileUp />
          {t.sales.chooseFile}
        </Button>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {file?.name ?? t.sales.noFile}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {t.sales.columns(mode === 'current')}{' '}
        <button type="button" onClick={downloadTemplate}
          className="inline-flex cursor-pointer items-center gap-1 font-medium text-foreground underline underline-offset-2">
          <Download className="size-3" />
          {t.sales.template}
        </button>
      </p>

      {fileProblem && (
        <Alert variant="destructive">
          <AlertDescription>{fileProblem}</AlertDescription>
        </Alert>
      )}
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{toApiError(failure).message}</AlertDescription>
        </Alert>
      )}
      {check.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> {t.sales.checking}</p>
      )}
      {report && !check.isPending && (
        report.error_count > 0
          ? <ErrorList report={report} />
          : <Preview report={report} currency={store.currency} />
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t.common.cancel}</Button>
        <Button type="button" disabled={!ready || busy} onClick={() => file && save.mutate(file.content)}>
          {save.isPending && <Spinner />}
          {report && ready ? t.sales.importRows(report.rows) : t.sales.import}
        </Button>
      </DialogFooter>
    </div>
  )
}

function Preview({ report, currency }: { report: SalesImportReport; currency: string }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" role="status" aria-label={t.sales.checkResult}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <CircleCheck className="size-4 text-good" />
        {t.sales.fileFine}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Fact label={t.sales.rows}>{report.rows}</Fact>
        {report.mode === 'current' && <Fact label={t.sales.sales}>{report.sales}</Fact>}
        <Fact label={t.sales.products}>{report.products}</Fact>
        <Fact label={t.sales.revenue}>{formatMoney(report.revenue, currency)}</Fact>
        {report.first_day && report.last_day && (
          <Fact label={t.sales.period} wide>
            {report.first_day === report.last_day
              ? formatDay(report.first_day)
              : `${formatDay(report.first_day)} – ${formatDay(report.last_day)}`}
          </Fact>
        )}
      </dl>
    </div>
  )
}

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`flex justify-between gap-3 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

function ErrorList({ report }: { report: SalesImportReport }) {
  const { error_count: count, errors } = report
  const hidden = count - errors.length
  const t = useT()

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3" role="alert">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CircleAlert className="size-4 text-destructive" />
        {t.sales.problems(count)}
      </p>
      <ul aria-label={t.sales.problemsLabel} className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
        {errors.map(({ row, message }) => (
          <li key={`${row}-${message}`}>
            <span className="font-medium figures">{t.sales.row(row)}</span>{' '}
            <span className="text-muted-foreground">{serverText('import', message, true)}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className="text-xs text-muted-foreground">{t.sales.more(hidden)}</p>}
    </div>
  )
}
