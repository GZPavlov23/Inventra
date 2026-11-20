// Light, dark, or whatever the computer is set to. The choice is kept in this browser only: it
// is about the screen in front of you, not about the account.

export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'inventra-theme'
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function readTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system' // storage can be blocked, e.g. in a private window
  }
}

export function saveTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Not saved, but still applied for this visit.
  }
  applyTheme(choice)
}

export function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && darkQuery().matches)
  document.documentElement.classList.toggle('dark', dark)
}

// Follows the computer when it switches between light and dark (at sunset, for example).
export function watchSystemTheme(onChange: () => void): () => void {
  const query = darkQuery()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
