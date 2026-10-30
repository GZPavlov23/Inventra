import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { type Product, productsApi } from '@/lib/products-api'

type ProductPickerProps = {
  id: string
  value: Product | null
  onChange: (product: Product) => void
}

// Finds a product on the server, because a store can have thousands of them. It searches
// by barcode too, so a USB scanner works: it types the code and presses Enter.
export function ProductPicker({ id, value, onChange }: ProductPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const typed = query.trim()
  const search = useDebouncedValue(typed)

  const products = useQuery({
    queryKey: ['products', 'picker', search],
    queryFn: () =>
      productsApi.list({ search, status: 'active', sort: 'name', order: 'asc', limit: 20, offset: 0 }),
    enabled: open,
    placeholderData: keepPreviousData,
  })

  // Until the results for the current text arrive, the rows belong to the previous search.
  // Picking one then, by a scanner's fast Enter for example, would book the goods on the
  // wrong product.
  const outdated = typed !== search || products.isPlaceholderData

  // The list library would keep pointing at a row from the previous search, and then Enter
  // does nothing. So the highlighted row is worked out here: the first one, unless the
  // arrow keys or the mouse moved it to another row that is still on the list.
  const items = products.data?.items ?? []
  const [highlighted, setHighlighted] = useState('')
  const stillListed = items.some((product) => String(product.id) === highlighted)
  const activeRow = stillListed ? highlighted : String(items[0]?.id ?? '')

  const choose = (product: Product) => {
    onChange(product)
    setQuery('')
    setOpen(false)
  }

  return (
    // "modal" lets the mouse wheel scroll this list while it is open inside a dialog.
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={`truncate ${value ? '' : 'text-muted-foreground'}`}>
            {value?.name ?? 'Choose a product'}
          </span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
        {/* The server already filtered these rows. */}
        <Command shouldFilter={false} value={activeRow} onValueChange={setHighlighted}>
          <CommandInput
            placeholder="Search by name or barcode"
            maxLength={100}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {!outdated && products.data?.total === 0 && <CommandEmpty>No products found.</CommandEmpty>}
            <CommandGroup>
              {items.map((product) => (
                <CommandItem
                  key={product.id}
                  value={String(product.id)}
                  disabled={outdated}
                  data-checked={product.id === value?.id}
                  onSelect={() => choose(product)}
                >
                  <span className="truncate">{product.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
