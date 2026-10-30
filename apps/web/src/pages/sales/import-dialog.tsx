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

const MODES: { value: ImportMode; label: string; explanation: string }[] = [
  {
    value: 'current',
    label: 'Current sales',
    explanation: 'What your till sold. Takes the goods out of your stock, from the batches that expire first.',
  },
  {
    value: 'history',
    label: 'Old history',
    explanation:
      'Past sales for the demand forecast. Your stock stays as it is, and they don’t show in Sales or in your profit, because old sales have no batches to take a real cost from.',
  },
]

export function ImportDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Import sales</DialogTitle>
          <DialogDescription>
            Upload a CSV file from your till. It is checked first, and nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>
        <ImportForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ImportForm({ onClose }: { onClose: () => void }) {
  const { store } = useCurrentUser()
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
      toast.success(`${report.rows} rows imported`)
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
      setFileProblem('This file is too big. The limit is 10 MB.')
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
            {MODES.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          {MODES.find(({ value }) => value === mode)?.explanation}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          className="sr-only"
          onChange={(event) => void chooseFile(event)}
        />
        <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
          <FileUp />
          Choose a file
        </Button>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {file?.name ?? 'No file chosen'}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Columns: {mode === 'current' && 'receipt, '}date, barcode or product, quantity, and optionally
        unit_price. Bulgarian column names work too.{' '}
        <button type="button" onClick={downloadTemplate}
          className="inline-flex cursor-pointer items-center gap-1 font-medium text-foreground underline underline-offset-2">
          <Download className="size-3" />
          Download a template
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
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Checking the file</p>
      )}
      {report && !check.isPending && (
        report.error_count > 0
          ? <ErrorList report={report} />
          : <Preview report={report} currency={store.currency} />
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={!ready || busy} onClick={() => file && save.mutate(file.content)}>
          {save.isPending && <Spinner />}
          {report && ready ? `Import ${report.rows} rows` : 'Import'}
        </Button>
      </DialogFooter>
    </div>
  )
}

function Preview({ report, currency }: { report: SalesImportReport; currency: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" role="status" aria-label="Check result">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CircleCheck className="size-4 text-primary" />
        The file is fine. Nothing is saved yet.
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Fact label="Rows">{report.rows}</Fact>
        {report.mode === 'current' && <Fact label="Sales">{report.sales}</Fact>}
        <Fact label="Products">{report.products}</Fact>
        <Fact label="Revenue">{formatMoney(report.revenue, currency)}</Fact>
        {report.first_day && report.last_day && (
          <Fact label="Period" wide>
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

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3" role="alert">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CircleAlert className="size-4 text-destructive" />
        {count === 1 ? '1 problem' : `${count} problems`} found. Nothing was saved.
      </p>
      <ul aria-label="Problems in the file" className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
        {errors.map(({ row, message }) => (
          <li key={`${row}-${message}`}>
            <span className="font-medium tabular-nums">Row {row}:</span>{' '}
            <span className="text-muted-foreground">{message}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className="text-xs text-muted-foreground">And {hidden} more</p>}
    </div>
  )
}
