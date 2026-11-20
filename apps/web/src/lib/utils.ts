import { createCn } from 'cn/config'

// Class merging that also knows our own shadow, so "shadow-none" can switch off "shadow-soft".
export const cn = createCn({ extend: { theme: { shadow: ['soft'] } } })
