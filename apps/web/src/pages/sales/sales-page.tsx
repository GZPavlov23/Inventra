import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FileUp, Plus, ReceiptText, ShoppingCart } from 'lucide-react'
import { useState } from 'react'

import { useCan, useCurrentUser } from '@/auth/use-auth'
import { useOpenNewSale } from '@/components/new-sale/new-sale-context'
import { Pagination } from '@/components/pagination'
import { StatPanel, StatTile } from '@/components/stat-tile'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PAGE_SIZE, useListParams, useReturnToLastPage } from '@/hooks/use-list-params'
import { daysAgo, formatMoney, formatPercent, today } from '@/lib/format'
import { type Sale, type SalePeriod, salesApi } from '@/lib/sales-api'
import { ImportDialog } from '@/pages/sales/import-dialog'
import { SaleDetailsDialog } from '@/pages/sales/sale-details-dialog'
import { SalesTable, SalesTableSkeleton } from '@/pages/sales/sales-table'
import { currentLocale } from '@/i18n/language'
import type { Messages } from '@/i18n/en'
import { useT } from '@/i18n/language-context'

const PERIODS: { value: string; period: () => SalePeriod }[] = [
  { value: 'today', period: () => ({ dateFrom: today(), dateTo: today() }) },
  { value: '7d', period: () => ({ dateFrom: daysAgo(6), dateTo: today() }) },
  { value: '30d', period: () => ({ dateFrom: daysAgo(29), dateTo: today() }) },
  { value: 'all', period: () => ({}) },
]

function readPeriod(value: string | null) {
  return PERIODS.find((period) => period.value === value) ?? PERIODS[0]
}

export function SalesPage() {
  const can = useCan()
  return can('see_finances') ? <SalesOverview canImport={can('plan')} /> : <TillOnly />
}

// For staff: sales go straight into the stock, but the list with its money isn't theirs to see.
function TillOnly() {
  const t = useT()
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t.nav.sales}</h2>
          <p className="text-sm text-muted-foreground">{t.sales.tillSubtitle}</p>
        </div>
        <NewSaleButton />
      </div>
      <Empty className="rounded-2xl bg-card shadow-soft">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ShoppingCart /></EmptyMedia>
          <EmptyTitle>{t.sales.ready}</EmptyTitle>
          <EmptyDescription>
            {t.sales.readyText}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}

function SalesOverview({ canImport }: { canImport: boolean }) {
  const { store } = useCurrentUser()
  const t = useT()
  const { searchParams, page, updateParams } = useListParams()
  const selected = readPeriod(searchParams.get('period'))
  const period = selected.period()

  const summary = useQuery({
    queryKey: ['sales', 'summary', period],
    queryFn: () => salesApi.summary(period),
    placeholderData: keepPreviousData,
  })
  const sales = useQuery({
    queryKey: ['sales', 'list', period, page],
    queryFn: () => salesApi.list(period, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    // While the next page loads, keep showing the current one instead of a blank table.
    placeholderData: keepPreviousData,
  })
  useReturnToLastPage(sales.data, updateParams)

  // Kept separately from `detailsOpen`, so the dialog keeps its content while it closes.
  const [viewing, setViewing] = useState<Sale | undefined>()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const openDetails = (sale: Sale) => {
    setViewing(sale)
    setDetailsOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t.nav.sales}</h2>
          <p className="text-sm text-muted-foreground">{t.sales.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canImport && <ImportButton />}
          <NewSaleButton />
        </div>
      </div>

      <Tabs
        value={selected.value}
        onValueChange={(value) => updateParams({ period: value === 'today' ? null : value, page: null })}
      >
        <TabsList>
          {PERIODS.map(({ value }) => (
            <TabsTrigger key={value} value={value}>
              {t.sales.periods[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <StatPanel className="sm:grid-cols-3">
        <StatTile label={t.sales.sales} value={summary.data?.sales.toLocaleString(currentLocale())} />
        <StatTile
          label={t.sales.revenue}
          value={summary.data && formatMoney(summary.data.revenue, store.currency)}
        />
        <StatTile
          label={t.sales.profit}
          value={summary.data && formatMoney(summary.data.profit, store.currency)}
          note={marginNote(t, summary.data?.revenue, summary.data?.profit)}
        />
      </StatPanel>

      {sales.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {sales.error.message}
            <Button size="sm" variant="outline" onClick={() => void sales.refetch()}>
              {t.common.tryAgain}
            </Button>
          </AlertDescription>
        </Alert>
      ) : sales.isPending ? (
        <div className="rounded-2xl bg-card shadow-soft">
          <SalesTableSkeleton />
        </div>
      ) : sales.data.total === 0 ? (
        <Empty className="rounded-2xl bg-card shadow-soft">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ReceiptText /></EmptyMedia>
            <EmptyTitle>{t.sales.noSales}</EmptyTitle>
            <EmptyDescription>{t.sales.noSalesText}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NewSaleButton />
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {/* Slightly faded while a new page or period is loading. */}
          <div
            className={`rounded-2xl bg-card shadow-soft transition-opacity ${sales.isPlaceholderData ? 'opacity-60' : ''}`}
            aria-busy={sales.isFetching}
          >
            <SalesTable sales={sales.data.items} currency={store.currency} onOpen={openDetails} />
          </div>
          <Pagination
            page={page}
            total={sales.data.total}
            onPageChange={(next) => updateParams({ page: next === 1 ? null : String(next) })}
          />
        </>
      )}

      <SaleDetailsDialog
        sale={viewing}
        currency={store.currency}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  )
}

// Markup on what the goods cost, and margin on what they sold for.
function marginNote(t: Messages, revenue?: string, profit?: string): string | undefined {
  if (!revenue || !profit || Number(revenue) === 0) return undefined
  const cost = Number(revenue) - Number(profit)
  const margin = formatPercent((Number(profit) / Number(revenue)) * 100)
  return cost > 0 ? t.sales.markupAndMargin(formatPercent((Number(profit) / cost) * 100), margin) : t.sales.margin(margin)
}

function ImportButton() {
  const [open, setOpen] = useState(false)
  const t = useT()
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileUp />
        {t.sales.importCsv}
      </Button>
      <ImportDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function NewSaleButton() {
  const openNewSale = useOpenNewSale()
  const t = useT()
  return (
    <Button onClick={openNewSale}>
      <Plus />
      {t.newSale.button}
    </Button>
  )
}
