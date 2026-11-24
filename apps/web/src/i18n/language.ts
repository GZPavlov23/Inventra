import { bg } from '@/i18n/bg'
import { en, type Messages } from '@/i18n/en'

// The site's language: Bulgarian unless the person chose English. The choice is kept in this
// browser only, like the theme: it is about the screen in front of you, not the account.

export type Language = 'bg' | 'en'

export const LANGUAGE_KEY = 'inventra-language'
const MESSAGES: Record<Language, Messages> = { bg, en }
// For dates and numbers: "20 ноември", "1 582,01 €" against "November 20", "€1,582.01".
const LOCALES: Record<Language, string> = { bg: 'bg-BG', en: 'en-US' }

export function readLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'bg'
  } catch {
    return 'bg' // storage can be blocked, e.g. in a private window
  }
}

export function saveLanguage(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language)
  } catch {
    // Not remembered, but still switched for this visit.
  }
}

// The language in use, for the formatting helpers in lib/format.ts, which aren't components and
// so can't ask React. The provider keeps it in step; the whole page is redrawn on a switch.
let current: Language = readLanguage()

export function setCurrentLanguage(language: Language) {
  current = language
  document.documentElement.lang = language
}

export const currentLanguage = () => current
export const currentLocale = () => LOCALES[current]
export const currentMessages = () => MESSAGES[current]
export const messagesFor = (language: Language) => MESSAGES[language]
