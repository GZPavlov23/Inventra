import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Plus, Search } from 'lucide-react'
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

const PREVIEW_NAV = ['Dashboard', 'Products', 'Inventory', 'Deliveries', 'Sales']

// Background circles: size in rem, seconds per full turn of their orbiting dot, and direction.
const ORBITS = [
  { size: 68, seconds: 70, direction: 1 },
  { size: 52, seconds: 50, direction: -1 },
  { size: 36, seconds: 32, direction: 1 },
]

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

        // Very slow, endless motion: each circle turns (so its dot orbits) and gently "breathes".
        gsap.utils.toArray<HTMLElement>('[data-orbit]').forEach((circle, index) => {
          const { seconds, direction } = ORBITS[index]
          gsap.to(circle, { rotation: 360 * direction, duration: seconds, ease: 'none', repeat: -1 })
          gsap.to(circle, {
            scale: 1.03,
            duration: 5 + index,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
          })
        })
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
      {/* Faint concentric circles behind the frame, each with a small orbiting dot.
          Two layers per circle: the outer one is centred with translate classes and never
          animated; the inner one is rotated by GSAP. (GSAP's rotation overwrites the CSS
          translate property, so animating the centred element itself would move it.) */}
      <div aria-hidden className="pointer-events-none absolute top-1/2 left-[55%]">
        {ORBITS.map(({ size }) => (
          <div
            key={size}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: `${size}rem`, height: `${size}rem` }}
          >
            <div data-orbit className="relative size-full rounded-full border border-primary/15">
              <span className="absolute top-0 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/40" />
            </div>
          </div>
        ))}
      </div>

      <div
        data-preview-frame
        aria-hidden
        className="relative ml-16 flex h-[34rem] w-[54rem] shrink-0 overflow-hidden rounded-3xl bg-background shadow-soft"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The same top bar as the app: the logo, then the pages as pills. */}
          <div className="flex items-center gap-4 border-b px-8 py-4">
            <img src={logoMark} alt="" className="size-7" />
            <span className="font-heading text-lg font-bold">Inventra</span>
            <div className="flex gap-1 rounded-full bg-secondary p-1 text-xs font-bold text-muted-foreground">
              {PREVIEW_NAV.map((title) => (
                <span
                  key={title}
                  className={title === 'Products' ? 'rounded-full bg-card px-3 py-1 text-foreground shadow-sm' : 'px-3 py-1'}
                >
                  {title}
                </span>
              ))}
            </div>
          </div>
          <div className="flex-1 px-8 py-6">
            <h3 className="text-2xl font-bold">Products</h3>

            <div className="mt-5 flex items-center gap-3">
              <div className="flex h-9 w-64 items-center gap-2 rounded-full border bg-card px-3 text-sm text-muted-foreground">
                <Search className="size-4" /> Search products…
              </div>
              <div className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground">
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
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold">
                        {product.category}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-xs text-muted-foreground">{product.barcode}</td>
                    <td className="py-3 text-right figures">{product.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </aside>
  )
}
