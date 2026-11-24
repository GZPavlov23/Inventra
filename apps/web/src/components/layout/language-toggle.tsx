import type { MouseEvent } from 'react'

import { useLanguage } from '@/i18n/language-context'

// "БГ | EN": the language in use is lit. A click switches to the other one, and the new
// language spreads over the page from here.
export function LanguageToggle() {
  const { language, t, switchLanguage } = useLanguage()

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    switchLanguage({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.language.switchTo}
      lang={language === 'bg' ? 'en' : 'bg'}
      className="flex h-9 items-center gap-0.5 rounded-full bg-secondary p-1 text-xs font-extrabold outline-offset-2"
    >
      {(['bg', 'en'] as const).map((code) => (
        <span
          key={code}
          aria-hidden
          className={`rounded-full px-2 py-1 transition-colors ${
            code === language ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(120_80_30/0.12)]' : 'text-muted-foreground'
          }`}
        >
          {code === 'bg' ? 'БГ' : 'EN'}
        </span>
      ))}
    </button>
  )
}
