import { useEffect, useState } from 'react'

// Returns `value` only after it has stopped changing for `delayMs`. Used for search boxes,
// so we send one request when the user pauses typing, not one per key press.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
