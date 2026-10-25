import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { type ReactNode, useRef } from 'react'
import { useLocation } from 'react-router'

gsap.registerPlugin(useGSAP)

// A short fade-and-rise when the page changes. It is skipped entirely for users who asked
// their operating system for reduced motion.
export function PageTransition({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  useGSAP(
    () => {
      const media = gsap.matchMedia()
      media.add('(prefers-reduced-motion: no-preference)', () => {
        // fromTo (not from): if the user switches pages mid-animation, it still ends fully visible.
        gsap.fromTo(
          container.current,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', clearProps: 'opacity,transform' },
        )
      })
      return () => media.revert()
    },
    { dependencies: [pathname], scope: container },
  )

  return <div ref={container}>{children}</div>
}
