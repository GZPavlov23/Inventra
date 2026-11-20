import { Plus } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation } from 'react-router'

import { useCan } from '@/auth/use-auth'
import { useOpenNewSale } from '@/components/new-sale/new-sale-context'

const OPEN_WINDOW = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]'

// Somewhere the person is typing: there N is a letter, not a shortcut.
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

// Selling is what the shop does most, so it is one click (or the N key) away on every page.
// The Sales page has its own button in the header, so the floating one stays away from it.
export function FloatingNewSale() {
  const can = useCan()
  const openNewSale = useOpenNewSale()
  const { pathname } = useLocation()
  const shown = can('sell') && pathname !== '/sales'

  useEffect(() => {
    if (!can('sell')) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey) return
      // Not while typing, and not on top of another window that is already open.
      // (A window still fading out after closing doesn't count.)
      if (isTyping(event.target) || document.querySelector(OPEN_WINDOW)) return
      event.preventDefault()
      openNewSale()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [can, openNewSale])

  if (!shown) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center">
      <button
        type="button"
        onClick={openNewSale}
        aria-keyshortcuts="N"
        className="pointer-events-auto inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-extrabold text-primary-foreground shadow-[0_12px_28px_rgb(45_42_38/0.28)] transition-transform outline-offset-4 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Plus className="size-5" strokeWidth={2.6} aria-hidden />
        New sale
        <kbd aria-hidden className="hidden rounded-md bg-primary-foreground/15 px-1.5 font-sans text-xs sm:inline">N</kbd>
      </button>
    </div>
  )
}
