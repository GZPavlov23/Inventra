import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRef } from 'react'
import { useSearchParams } from 'react-router'

import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useT } from '@/i18n/language-context'
import {
  CategoriesPanel,
  RunningOutPanel,
  TopProductsPanel,
  WastePanel,
} from '@/pages/dashboard/report-panels'

gsap.registerPlugin(useGSAP)

const REPORTS = [
  { value: 'waste', label: 'waste', panel: WastePanel },
  { value: 'running-out', label: 'runningOut', panel: RunningOutPanel },
  { value: 'top-products', label: 'topProducts', panel: TopProductsPanel },
  { value: 'categories', label: 'categories', panel: CategoriesPanel },
] as const

// All reports stay on the page and only the chosen one is shown, so switching never waits for
// the server. The choice lives in the URL, so it survives a reload.
export function ReportsCard() {
  const t = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = REPORTS.find(({ value }) => value === searchParams.get('report')) ?? REPORTS[0]

  const box = useRef<HTMLDivElement>(null)
  const heightBefore = useRef<number | null>(null)

  // The reports differ in height. Without this the card would snap to the new size, and pull
  // the page along with it when it is scrolled to the bottom.
  useGSAP(
    () => {
      const element = box.current
      const from = heightBefore.current
      if (!element || from === null) return

      gsap.killTweensOf(element)
      gsap.set(element, { clearProps: 'height' })
      const to = element.offsetHeight
      const panel = element.querySelector('[data-report]:not([hidden])')

      const media = gsap.matchMedia()
      media.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          element,
          { height: from },
          { height: to, duration: 0.25, ease: 'power2.out', clearProps: 'height' },
        )
        gsap.fromTo(
          panel,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out', clearProps: 'opacity,transform' },
        )
      })
      return () => media.revert()
    },
    { dependencies: [selected.value] },
  )

  const choose = (value: string) => {
    heightBefore.current = box.current?.offsetHeight ?? null
    setSearchParams(value === REPORTS[0].value ? {} : { report: value }, { replace: true })
  }

  return (
    <section aria-label={t.reports.label} className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <Tabs value={selected.value} onValueChange={choose}>
          <TabsList>
            {REPORTS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>{t.reports.tabs[label]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <Card>
        <CardContent>
          <div ref={box} className="overflow-hidden" data-testid="report-box">
            {REPORTS.map(({ value, panel: Panel }) => (
              <div key={value} data-report hidden={value !== selected.value}>
                <Panel />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
