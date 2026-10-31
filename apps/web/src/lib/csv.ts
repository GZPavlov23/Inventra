// Excel runs a cell that starts with one of these as a formula. Names come from people and from
// imported files, so a product called =HYPERLINK(...) must stay plain text.
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

// Semicolons, because that is what Excel expects on a Bulgarian computer, and a byte order mark,
// so it shows Cyrillic correctly.
export function downloadCsv(fileName: string, rows: string[][]) {
  const text = rows.map((row) => row.map(cell).join(';')).join('\r\n')
  const blob = new Blob([`﻿${text}\r\n`], { type: 'text/csv' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}
