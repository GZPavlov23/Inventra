import type { ReactNode } from 'react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

// Clicks here don't close the panel: another row shows that row, and menus and toasts float
// above everything.
const KEEPS_OPEN = '[data-slot="table-row"], [data-radix-popper-content-wrapper], [data-sonner-toaster]'

type DetailsPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  // Something that belongs next to the title, such as a stamp.
  aside?: ReactNode
  // For content that carries its own heading, like a receipt: screen readers still get one.
  hideHeader?: boolean
  children: ReactNode
}

// Details open at the side and the list stays in view. A click on another row of the list
// shows that row here instead of closing; a click anywhere else, or Escape, closes the panel.
// Forms that change something stay dialogs in the middle, so they get full attention.
export function DetailsPanel({ open, onOpenChange, title, description, aside, hideHeader, children }: DetailsPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        // Focus leaving isn't a reason to close: a menu that opened the panel hands focus back
        // to its button as it closes, which would shut the panel at once.
        onFocusOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          if (event.target instanceof Element && event.target.closest(KEEPS_OPEN)) event.preventDefault()
        }}
      >
        <SheetHeader className={hideHeader ? 'sr-only' : 'flex-row items-start justify-between gap-4 border-b pr-12'}>
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle className="flex items-center gap-2 text-base">{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </div>
          {aside}
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
