import { useEffect, useState } from 'react'

import { applyTheme, readTheme, saveTheme, type ThemeChoice, watchSystemTheme } from '@/theme/theme'

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme)

  useEffect(() => {
    if (choice !== 'system') return
    return watchSystemTheme(() => applyTheme('system'))
  }, [choice])

  const choose = (next: ThemeChoice) => {
    saveTheme(next)
    setChoice(next)
  }
  return [choice, choose]
}
