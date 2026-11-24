import { Fragment, type ReactNode, useCallback, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'

import { LanguageContext } from '@/i18n/language-context'
import { type Language, messagesFor, readLanguage, saveLanguage, setCurrentLanguage } from '@/i18n/language'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = readLanguage()
    setCurrentLanguage(saved)
    return saved
  })

  const switchLanguage = useCallback(
    (origin?: { x: number; y: number }) => {
      const next: Language = language === 'bg' ? 'en' : 'bg'
      const apply = () => {
        saveLanguage(next)
        setCurrentLanguage(next)
        setLanguage(next)
      }

      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (calm || typeof document.startViewTransition !== 'function') {
        apply()
        return
      }
      // The new language spreads from the button as a growing circle: the browser takes a
      // picture of the page, draws the page in the other language underneath, and reveals it.
      const x = origin?.x ?? window.innerWidth / 2
      const y = origin?.y ?? 0
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      const root = document.documentElement.style
      root.setProperty('--wipe-x', `${x}px`)
      root.setProperty('--wipe-y', `${y}px`)
      root.setProperty('--wipe-r', `${radius}px`)
      document.startViewTransition(() => flushSync(apply))
    },
    [language],
  )

  const value = useMemo(
    () => ({ language, t: messagesFor(language), switchLanguage }),
    [language, switchLanguage],
  )
  return (
    <LanguageContext.Provider value={value}>
      {/* A new key draws the whole page again, so dates and numbers change language too. */}
      <Fragment key={language}>{children}</Fragment>
    </LanguageContext.Provider>
  )
}
