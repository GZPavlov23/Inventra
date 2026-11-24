import { Check } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { Button } from '@/components/ui/button'
import type { StoreSetup } from '@/lib/setup-api'
import { useStoreSetup } from '@/pages/dashboard/use-store-setup'
import { useT } from '@/i18n/language-context'

type Step = {
  key: keyof Omit<StoreSetup, 'done'>
  path: string
}

// In the order they depend on each other: no products, nothing to receive; no stock, nothing to sell.
// The words for each step are in the dictionary (t.setup.steps).
const STEPS: Step[] = [
  { key: 'products', path: '/products' },
  { key: 'goods', path: '/inventory' },
  { key: 'sales', path: '/sales' },
  { key: 'suppliers', path: '/suppliers' },
  { key: 'team', path: '/settings' },
]

const foldKey = (storeId: number) => `inventra-setup-folded-${storeId}`

// A choice for this browser only. Storage can be blocked (a private window), and then the
// list simply starts unfolded.
function readFolded(storeId: number): boolean {
  try {
    return localStorage.getItem(foldKey(storeId)) === 'yes'
  } catch {
    return false
  }
}

function saveFolded(storeId: number, folded: boolean) {
  try {
    if (folded) localStorage.setItem(foldKey(storeId), 'yes')
    else localStorage.removeItem(foldKey(storeId))
  } catch {
    // Not remembered, but still folded for this visit.
  }
}

// The first steps of a new store, on its dashboard until they are all done. Each step is ticked
// off by the data itself (a product exists, a batch exists...), never by a checkbox.
export function SetupChecklist() {
  const { store } = useCurrentUser()
  const t = useT()
  const setup = useStoreSetup()
  const [folded, setFolded] = useState(() => readFolded(store.id))

  if (!setup.data || setup.data.done) return null
  const data = setup.data
  const steps = STEPS.filter((step) => data[step.key] !== null)
  const doneCount = steps.filter((step) => data[step.key]).length
  const current = steps.find((step) => !data[step.key])
  const fold = (next: boolean) => {
    saveFolded(store.id, next)
    setFolded(next)
  }

  if (folded) {
    return (
      <p className="figures flex flex-wrap items-center justify-center gap-x-2 text-sm text-muted-foreground">
        {t.setup.folded(doneCount, steps.length)}
        <Button variant="link" size="sm" className="h-auto p-0 font-bold" onClick={() => fold(false)}>{t.common.show}</Button>
      </p>
    )
  }

  return (
    <section aria-labelledby="setup-title" className="rounded-3xl bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="setup-title" className="text-2xl font-bold">
          {t.setup.title(steps.length)}
        </h3>
        <div className="flex items-center gap-3">
          <span className="figures text-sm font-bold text-muted-foreground">{t.setup.progress(doneCount, steps.length)}</span>
          <Button variant="ghost" size="sm" onClick={() => fold(true)}>{t.common.notNow}</Button>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={t.setup.progressLabel}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-secondary"
      >
        <div className="h-full rounded-full bg-good transition-[width] duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <ol className="mt-4 flex flex-col gap-1.5">
        {steps.map((step, index) => {
          const done = data[step.key]
          const isCurrent = step === current
          return (
            <li key={step.key} aria-current={isCurrent ? 'step' : undefined}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-3.5 py-3 ${isCurrent ? 'bg-warning/60' : ''}`}>
              <span aria-hidden
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                  done ? 'bg-good text-primary-foreground'
                    : isCurrent ? 'border-[2.5px] border-foreground'
                      : 'border-[2.5px] border-border text-muted-foreground'}`}>
                {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
              </span>
              <div className="min-w-0 flex-[1_1_12rem]">
                <p className={`font-bold ${done ? 'text-muted-foreground line-through' : isCurrent ? '' : 'text-muted-foreground'}`}>
                  {t.setup.steps[step.key].title}
                  {done && <span className="sr-only"> {t.common.done}</span>}
                </p>
                {!done && <p className="text-sm text-muted-foreground">{t.setup.steps[step.key].why}</p>}
              </div>
              {isCurrent && (
                <Button asChild>
                  <Link to={step.path}>{t.setup.steps[step.key].action}</Link>
                </Button>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
