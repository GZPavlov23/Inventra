import { createContext, useContext } from 'react'

import type { Messages } from '@/i18n/en'
import type { Language } from '@/i18n/language'

export type LanguageContextValue = {
  language: Language
  t: Messages
  // origin: the point the new language spreads from, usually the button's centre.
  switchLanguage: (origin?: { x: number; y: number }) => void
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)

function useLanguageContext() {
  const value = useContext(LanguageContext)
  if (value === null) throw new Error('Language hooks must be used inside <LanguageProvider>')
  return value
}

// The texts in the chosen language: t.nav.dashboard, t.auth.registerSent(email)…
export const useT = () => useLanguageContext().t
export const useLanguage = () => useLanguageContext()
