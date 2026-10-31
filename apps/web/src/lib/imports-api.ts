import { api } from '@/lib/api'
import { downloadCsv } from '@/lib/csv'

// Shapes match the backend schemas in apps/api/app/schemas/sale_import.py.

export type ImportMode = 'current' | 'history'

export type SalesImportReport = {
  mode: ImportMode
  applied: boolean
  rows: number
  sales: number
  products: number
  first_day: string | null
  last_day: string | null
  revenue: string
  error_count: number
  errors: { row: number; message: string }[]
}

export const importsApi = {
  // With dryRun nothing is written: the server only reports what the import would do.
  sales: (mode: ImportMode, content: string, dryRun: boolean) =>
    api<SalesImportReport>('/imports/sales', {
      method: 'POST',
      body: { mode, content, dry_run: dryRun },
    }),
}

// The largest file the server accepts.
export const MAX_FILE_BYTES = 10_000_000

// Excel on a Bulgarian computer often saves in the old Windows encoding instead of UTF-8.
export async function readTextFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1251').decode(bytes)
  }
}

// A template to fill in: one line with a barcode, and one sold by weight without a barcode.
export function downloadTemplate() {
  downloadCsv('inventra-sales-template.csv', [
    ['receipt', 'date', 'barcode', 'product', 'quantity', 'unit_price'],
    ['R-1001', '30.10.2026', '2000000000015', '', '2', '1,59'],
    ['R-1001', '30.10.2026', '', 'Банани', '1,250', ''],
  ])
}
