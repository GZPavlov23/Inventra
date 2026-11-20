import { type ReactNode, useCallback, useState } from 'react'

import { NewSaleContext } from '@/components/new-sale/new-sale-context'
import { NewSaleDialog } from '@/pages/sales/new-sale-dialog'

export function NewSaleProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openNewSale = useCallback(() => setOpen(true), [])
  return (
    <NewSaleContext.Provider value={openNewSale}>
      {children}
      <NewSaleDialog open={open} onOpenChange={setOpen} />
    </NewSaleContext.Provider>
  )
}
