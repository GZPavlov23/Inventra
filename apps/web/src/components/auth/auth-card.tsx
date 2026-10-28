import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { type ReactNode, useRef } from 'react'

import { Card } from '@/components/ui/card'

gsap.registerPlugin(useGSAP)

const MOTION_OK = '(prefers-reduced-motion: no-preference)'

type AuthCardProps = {
  children: ReactNode
  // Changing it replays the entrance (e.g. when a form turns into a "check your email" view).
  animationKey?: string
  // Changing it (e.g. a new error) gives the card a short shake.
  shakeKey?: unknown
}

// The container of each login/register form, with its few small animations:
// - the card rises in, and elements marked data-animate follow one after another;
// - elements marked data-pop (success icons) pop in;
// - a short horizontal shake when an error appears.
// Nothing moves for users who asked their operating system for reduced motion.
export function AuthCard({ children, animationKey, shakeKey }: AuthCardProps) {
  const card = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const media = gsap.matchMedia()
      media.add(MOTION_OK, () => {
        const done = { opacity: 1, y: 0, scale: 1, clearProps: 'opacity,transform' }
        gsap.fromTo(card.current, { opacity: 0, y: 16 }, { ...done, duration: 0.45, ease: 'power3.out' })

        const items = card.current!.querySelectorAll('[data-animate]')
        if (items.length) {
          gsap.fromTo(items, { opacity: 0, y: 8 },
            { ...done, duration: 0.35, ease: 'power2.out', stagger: 0.05, delay: 0.1 })
        }
        const pops = card.current!.querySelectorAll('[data-pop]')
        if (pops.length) {
          gsap.fromTo(pops, { opacity: 0, scale: 0.5 },
            { ...done, duration: 0.5, ease: 'back.out(2)', delay: 0.15 })
        }
      })
      return () => media.revert()
    },
    { dependencies: [animationKey], scope: card },
  )

  useGSAP(
    () => {
      if (!shakeKey) return
      const media = gsap.matchMedia()
      media.add(MOTION_OK, () => {
        gsap.to(card.current, {
          keyframes: { x: [-6, 6, -4, 4, -2, 0] },
          duration: 0.4,
          ease: 'power1.inOut',
          // clearProps is ignored by keyframe tweens, so the leftover transform is removed here.
          onComplete: () => gsap.set(card.current, { clearProps: 'transform' }),
        })
      })
      return () => media.revert()
    },
    { dependencies: [shakeKey], scope: card },
  )

  return (
    // No frame: the form sits directly on the page (spacing variable set to 0 removes padding).
    <Card ref={card} className="gap-8 overflow-visible bg-transparent py-0 shadow-none ring-0 [--card-spacing:0px]">
      {children}
    </Card>
  )
}
