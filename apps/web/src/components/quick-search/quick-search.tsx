import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { useCan } from '@/auth/use-auth'
import { useOpenNewSale } from '@/components/new-sale/new-sale-context'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ALL_NAV_ITEMS } from '@/config/navigation'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { daysUntil, formatDay, formatQuantity } from '@/lib/format'
import { inventoryApi } from '@/lib/inventory-api'
import { productsApi } from '@/lib/products-api'
import { en, type Messages } from '@/i18n/en'
import { useT } from '@/i18n/language-context'

const PRODUCTS_SHOWN = 5
const BATCHES_SHOWN = 4
const OPEN_WINDOW = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
const SEARCH_SHORTCUT = isMac ? '⌘ K' : 'Ctrl K'

// One box for everything: type a name or scan a barcode, and go to the product, the batch, the
// page or the action, without the mouse. Opens with Ctrl K (⌘ K on a Mac) from any page.
export function QuickSearch() {
  const t = useT()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      // Not on top of another window, such as a half-filled sale. A window that is still
      // fading out after closing doesn't count.
      setOpen((isOpen) => isOpen || !document.querySelector(OPEN_WINDOW))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Control+K Meta+K"
        title={`${t.header.search} (${SEARCH_SHORTCUT})`}
        className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="size-4" aria-hidden />
        <span className="sr-only">{t.header.search}</span>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title={t.search.title}
        description={t.search.description} className="rounded-3xl! sm:max-w-xl">
        {/* Mounted only while open, so every opening starts with an empty box. */}
        {open && <SearchBox close={() => setOpen(false)} />}
      </CommandDialog>
    </>
  )
}

function SearchBox({ close }: { close: () => void }) {
  const can = useCan()
  const t = useT()
  const navigate = useNavigate()
  const openNewSale = useOpenNewSale()
  const [text, setText] = useState('')
  const search = useDebouncedValue(text.trim(), 200)
  const looking = search.length > 0

  const products = useQuery({
    queryKey: ['products', 'quick-search', search],
    queryFn: () => productsApi.list({
      search, status: 'active', sort: 'name', order: 'asc', limit: PRODUCTS_SHOWN, offset: 0,
    }),
    enabled: looking,
  })
  const batches = useQuery({
    queryKey: ['batches', 'quick-search', search],
    queryFn: () => inventoryApi.list({ search, status: 'in_stock', limit: BATCHES_SHOWN, offset: 0 }),
    enabled: looking && can('handle_stock'),
  })

  const go = (path: string) => {
    close()
    void navigate(path)
  }
  const matches = (words: string) => words.toLowerCase().includes(text.trim().toLowerCase())
  // A page is found by its name in the chosen language, and by its English name too.
  const pages = ALL_NAV_ITEMS.filter(
    (item) => (!item.requires || can(item.requires)) && matches(`${t.nav[item.key]} ${en.nav[item.key]}`),
  )
  const sellAction = can('sell') && matches(t.search.saleWords)
  // Still waiting while typing hasn't paused yet, so "Nothing found" doesn't flash in between.
  const waiting = text.trim() !== search || (looking && (products.isFetching || batches.isFetching))
  // Shown all at once when both searches are back: otherwise whichever answered first would sit
  // on top for a moment, and a scanned barcode + Enter would open whatever that happened to be.
  const showResults = looking && !waiting
  const foundProducts = showResults ? products.data?.items ?? [] : []
  const foundBatches = showResults ? batches.data?.items ?? [] : []

  // Enter always means the first row of what is on screen now.
  const firstValue = foundProducts[0] ? `product-${foundProducts[0].id}`
    : foundBatches[0] ? `batch-${foundBatches[0].id}`
    : sellAction ? 'action-new-sale'
    : pages[0] ? `page-${pages[0].path}` : ''
  const [selected, setSelected] = useState(firstValue)
  const [shownFor, setShownFor] = useState(firstValue)
  if (firstValue !== shownFor) {
    setShownFor(firstValue)
    setSelected(firstValue)
  }

  return (
    // The server already searched, so the list shows what it found instead of filtering again.
    <Command shouldFilter={false} value={selected} onValueChange={setSelected} className="rounded-3xl! p-2">
      <CommandInput value={text} onValueChange={setText} placeholder={t.search.placeholder}
        aria-label={t.search.label} className="h-10 text-base" />
      <CommandList className="max-h-[min(28rem,60svh)] p-1">
        {!waiting && <CommandEmpty>{t.search.nothingFound(text.trim())}</CommandEmpty>}

        {foundProducts.length > 0 && (
          <CommandGroup heading={t.search.products}>
            {foundProducts.map((product) => (
              <CommandItem key={product.id} value={`product-${product.id}`}
                onSelect={() => go(`/products/${product.id}`)}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{product.name}</span>
                  <span className="figures text-xs text-muted-foreground">
                    {t.search.inStock(formatQuantity(product.stock, product.unit))}
                    {product.barcode && ` · ${product.barcode}`}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {foundBatches.length > 0 && (
          <CommandGroup heading={t.search.batches}>
            {foundBatches.map((batch) => (
              <CommandItem key={batch.id} value={`batch-${batch.id}`}
                onSelect={() => go(`/inventory?q=${encodeURIComponent(batch.product.barcode ?? batch.product.name)}`)}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">
                    {batch.product.name} · {formatQuantity(batch.remaining_quantity, batch.product.unit)}
                  </span>
                  <span className="figures text-xs text-muted-foreground">
                    {batch.expiry_date ? t.search.expires(formatDay(batch.expiry_date)) : t.search.noExpiry}
                  </span>
                </div>
                {batch.expiry_status === 'expiring' && batch.expiry_date && (
                  <Badge variant="secondary" className="bg-warning text-warning-foreground">{daysLeft(batch.expiry_date, t)}</Badge>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {sellAction && (
          <CommandGroup heading={t.search.actions}>
            <CommandItem value="action-new-sale" onSelect={() => { close(); openNewSale() }}>
              <Plus aria-hidden />
              <span className="font-bold">{t.newSale.button}</span>
              <kbd className="ml-auto text-xs text-muted-foreground">N</kbd>
            </CommandItem>
          </CommandGroup>
        )}

        {pages.length > 0 && (
          <CommandGroup heading={t.search.goTo}>
            {pages.map((item) => (
              <CommandItem key={item.path} value={`page-${item.path}`} onSelect={() => go(item.path)}>
                <item.icon aria-hidden />
                <span className="font-bold">{t.nav[item.key]}</span>
                <ArrowRight className="ml-auto text-muted-foreground" aria-hidden />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t px-3 pt-2.5 pb-1 text-xs text-muted-foreground">
        <span><b>↑ ↓</b> {t.search.move}</span>
        <span><b>Enter</b> {t.search.open}</span>
        <span><b>Esc</b> {t.search.close}</span>
      </p>
    </Command>
  )
}

function daysLeft(day: string, t: Messages): string {
  const days = daysUntil(day)
  return days === 0 ? t.search.today : days === 1 ? t.search.tomorrow : t.search.daysLeft(days)
}
