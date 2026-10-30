import { useQuery } from '@tanstack/react-query'
import { ChevronsUpDown, Plus, X } from 'lucide-react'
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
import { productsApi } from '@/lib/products-api'

type CategoryComboboxProps = {
  id: string
  value: string
  onChange: (category: string) => void
  invalid?: boolean
}

// Pick one of the store's categories or add a new one. Offering the existing ones keeps people
// from typing a slightly different name; the server also unifies upper/lower case spellings.
export function CategoryCombobox({ id, value, onChange, invalid }: CategoryComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const categories = useQuery({
    // Starts with 'products', so adding a product refreshes this list too.
    queryKey: ['products', 'categories'],
    queryFn: productsApi.categories,
  })

  const existing = categories.data ?? []
  // A category added a moment ago in this form isn't in the server's list yet.
  const options = value && !existing.includes(value) ? [value, ...existing] : existing
  const typed = query.trim().replace(/\s+/g, ' ')
  const search = typed.toLowerCase()
  const matches = options.filter((option) => option.toLowerCase().includes(search))
  const isNew = typed !== '' && !options.some((option) => option.toLowerCase() === search)

  const choose = (category: string) => {
    onChange(category)
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
          aria-invalid={invalid}
          className="w-full justify-between font-normal"
        >
          <span className={`truncate ${value ? '' : 'text-muted-foreground'}`}>
            {value || 'Choose or add'}
          </span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
        {/* We filter ourselves: the library would reorder the rows and could put "Add" first,
            so Enter would create a near-duplicate instead of picking the existing category. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or add a category"
            maxLength={80}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No categories yet. Type one to add it.</CommandEmpty>
            <CommandGroup>
              {matches.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  data-checked={option === value}
                  onSelect={() => choose(option)}
                >
                  {option}
                </CommandItem>
              ))}
              {isNew && (
                <CommandItem value={`add:${typed}`} onSelect={() => choose(typed)}>
                  <Plus />
                  Add “{typed}”
                </CommandItem>
              )}
              {value && typed === '' && (
                <CommandItem value="clear" onSelect={() => choose('')}>
                  <X />
                  No category
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
