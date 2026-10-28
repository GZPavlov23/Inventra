import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Boxes, LayoutDashboard, Package, Plus, Search, ShoppingCart, Sparkles, Truck } from 'lucide-react'
import { useRef } from 'react'

import logoMark from '@/assets/logo-mark.png'

gsap.registerPlugin(useGSAP)

// A static picture of the platform for the login/register pages. The rows are the demo
// products from apps/api/scripts/seed_demo.py, so it shows real catalog fields only
// (no invented stock levels or expiry dates).
const PREVIEW_PRODUCTS = [
  { name: 'Прясно мляко 3% 1 л', category: 'Млечни', barcode: '2000000000015', price: '1.59' },
  { name: 'Кисело мляко 3.6% 400 г', category: 'Млечни', barcode: '2000000000022', price: '0.99' },
  { name: 'Бял хляб 500 г', category: 'Хляб', barcode: '2000000000046', price: '1.09' },
  { name: 'Яйца размер M 10 бр.', category: 'Яйца', barcode: '2000000000060', price: '2.99' },
  { name: 'Пилешко филе 500 г', category: 'Месо', barcode: '2000000000077', price: '4.59' },
  { name: 'Минерална вода 1.5 л', category: 'Напитки', barcode: '2000000000084', price: '0.65' },
  { name: 'Банани', category: 'Плодове и зеленчуци', barcode: '—', price: '1.89 / kg' },
]

const SIDEBAR_ICONS = [LayoutDashboard, Package, Boxes, Truck, ShoppingCart, Sparkles]

export function ProductPreview() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const media = gsap.matchMedia()
      media.add('(prefers-reduced-motion: no-preference)', () => {
        const done = { opacity: 1, x: 0, y: 0, clearProps: 'opacity,transform' }
        gsap.fromTo('[data-preview-frame]', { opacity: 0, x: 48 },
          { ...done, duration: 0.8, ease: 'power3.out', delay: 0.1 })
        gsap.fromTo('[data-preview-row]', { opacity: 0, y: 6 },
          { ...done, duration: 0.4, ease: 'power2.out', stagger: 0.05, delay: 0.45 })
      })
      return () => media.revert()
    },
    { scope: root },
  )

  return (
    <aside
      ref={root}
      role="img"
      aria-label="Illustration of the Inventra platform with demo products"
      className="relative hidden items-center overflow-hidden border-l bg-muted/40 lg:flex"
    >
      {/* Faint concentric circles behind the frame. */}
      <div aria-hidden className="pointer-events-none absolute top-1/2 left-[55%] -translate-x-1/2 -translate-y-1/2">
        {[68, 52, 36].map((size) => (
          <div
            key={size}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15"
            style={{ width: `${size}rem`, height: `${size}rem` }}
          />
        ))}
      </div>

      <div
        data-preview-frame
        aria-hidden
        className="relative ml-16 flex h-[34rem] w-[54rem] shrink-0 overflow-hidden rounded-2xl border bg-background shadow-2xl shadow-primary/10"
      >
        <div className="flex w-16 shrink-0 flex-col items-center gap-2 border-r bg-sidebar py-5">
          <img src={logoMark} alt="" className="mb-4 size-8" />
          {SIDEBAR_ICONS.map((Icon, index) => (
            <span
              key={index}
              className={
                index === 1
                  ? 'flex size-10 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'flex size-10 items-center justify-center rounded-lg text-muted-foreground'
              }
            >
              <Icon className="size-4" />
            </span>
          ))}
        </div>

        <div className="flex-1 p-8">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Stock</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight">Products</h3>

          <div className="mt-5 flex items-center gap-3">
            <div className="flex h-9 w-64 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
              <Search className="size-4" /> Search products…
            </div>
            <div className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
              <Plus className="size-4" /> Add product
            </div>
          </div>

          <table className="mt-6 w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2.5 font-medium">Name</th>
                <th className="py-2.5 font-medium">Category</th>
                <th className="py-2.5 font-medium">Barcode</th>
                <th className="py-2.5 text-right font-medium">Price (EUR)</th>
              </tr>
            </thead>
            <tbody>
              {PREVIEW_PRODUCTS.map((product) => (
                <tr key={product.name} data-preview-row className="border-b last:border-0">
                  <td className="py-3 font-medium">{product.name}</td>
                  <td className="py-3">
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {product.category}
                    </span>
                  </td>
                  <td className="py-3 font-mono text-xs text-muted-foreground">{product.barcode}</td>
                  <td className="py-3 text-right tabular-nums">{product.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="absolute bottom-6 left-16 text-xs text-muted-foreground">
        Illustration with demo data
      </p>
    </aside>
  )
}
