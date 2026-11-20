import { createContext, useContext } from 'react'

// One "New sale" window for the whole app: the floating button, the N key, the Sales page and
// the quick search all open the same one, so a half-filled cart is never in two places.
export const NewSaleContext = createContext<(() => void) | null>(null)

export function useOpenNewSale() {
  const open = useContext(NewSaleContext)
  if (open === null) throw new Error('useOpenNewSale must be used inside <NewSaleProvider>')
  return open
}
