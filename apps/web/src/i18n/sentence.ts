import { createElement, Fragment, type ReactNode } from 'react'

// A sentence from the dictionary in parts, such as a bold product name inside the words. Each
// language puts the parts in its own order; this joins them without React asking for keys.
export const sentence = (parts: ReactNode[]) => createElement(Fragment, null, ...parts)
