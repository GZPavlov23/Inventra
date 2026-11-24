import { Outlet } from 'react-router'

import logoMark from '@/assets/logo-mark.png'
import { ProductPreview } from '@/components/auth/product-preview'
import { APP_NAME } from '@/config/app'
import { LanguageToggle } from '@/components/layout/language-toggle'

// The frame for the pages shown before logging in (login, register, password reset):
// logo and form on the left, a preview of the platform on the right (wide screens only).
export function AuthLayout() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img src={logoMark} alt="" className="size-8" />
            <span className="font-heading text-xl font-bold">{APP_NAME}</span>
          </div>
          {/* Before logging in too: someone who reads only English can switch at the door. */}
          <LanguageToggle />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <Outlet />
        </main>
      </div>
      <ProductPreview />
    </div>
  )
}
