import { readFileSync } from 'node:fs'

import { expect, type Page, test } from '@playwright/test'

import { logInAsDemoOwner } from './helpers.ts'

const API = '/api/v1'
const HEADER = 'receipt;date;barcode;product;quantity;unit_price'

test.beforeEach(async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.goto('/sales?period=all')
  await expect(page.getByRole('heading', { name: 'Sales', level: 2 })).toBeVisible()
})

const dialog = (page: Page) => page.getByRole('dialog')
const importButton = (page: Page) => dialog(page).getByRole('button', { name: /^Import/ })
const result = (page: Page) => dialog(page).getByRole('status', { name: 'Check result' })
const problems = (page: Page) => dialog(page).getByRole('list', { name: 'Problems in the file' })

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  return `${date}.${month}.${now.getFullYear()}`
}

async function createProduct(page: Page, name: string, stock?: string) {
  const response = await page.request.post(`${API}/products`, {
    data: { name, purchase_price: '1.00', sale_price: '2.00' },
  })
  expect(response.ok()).toBe(true)
  const product = (await response.json()) as { id: number }
  if (stock) {
    const batch = await page.request.post(`${API}/batches`, {
      data: { product_id: product.id, quantity: stock },
    })
    expect(batch.ok()).toBe(true)
  }
  return product
}

async function stockOf(page: Page, id: number): Promise<number> {
  const product = (await (await page.request.get(`${API}/products/${id}`)).json()) as { stock: string }
  return Number(product.stock)
}

async function salesTotal(page: Page): Promise<number> {
  const summary = (await (await page.request.get(`${API}/sales/summary`)).json()) as { sales: number }
  return summary.sales
}

async function openImport(page: Page) {
  await page.getByRole('button', { name: 'Import CSV' }).click()
  await expect(dialog(page).getByRole('heading', { name: 'Import sales' })).toBeVisible()
}

async function chooseFile(page: Page, content: string | Buffer, name = 'sales.csv') {
  await dialog(page).getByLabel('CSV file').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: typeof content === 'string' ? Buffer.from(content) : content,
  })
}

// The old Windows encoding of Excel on a Bulgarian computer.
function windows1251(text: string): Buffer {
  return Buffer.from(
    [...text].map((character) => {
      const code = character.charCodeAt(0)
      return code >= 0x410 && code <= 0x44f ? code - 0x410 + 0xc0 : code
    }),
  )
}

test('current sales are checked first, then take stock when confirmed', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е Импорт', '10')
  const before = await salesTotal(page)

  await openImport(page)
  await expect(importButton(page)).toBeDisabled()
  await chooseFile(page, `${HEADER}\nE2E-1;${today()};;Е2Е Импорт;3;1,50\nE2E-2;${today()};;Е2Е Импорт;2;`)

  await expect(result(page)).toContainText('The file is fine')
  await expect(result(page)).toContainText('€8.50')
  await expect(dialog(page).getByText('sales.csv')).toBeVisible()

  // Only a check so far.
  expect(await stockOf(page, product.id)).toBe(10)
  expect(await salesTotal(page)).toBe(before)

  await importButton(page).click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.getByText('2 rows imported')).toBeVisible()
  expect(await stockOf(page, product.id)).toBe(5)
  expect(await salesTotal(page)).toBe(before + 2)
  await expect(page.locator('tbody tr').filter({ hasText: 'Е2Е Импорт' })).toHaveCount(2)
})

test('the same file can not be imported twice', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е Двойно', '10')
  const content = `${HEADER}\nE2E-TWICE;${today()};;Е2Е Двойно;4;`

  await openImport(page)
  await chooseFile(page, content)
  await importButton(page).click()
  await expect(dialog(page)).toBeHidden()

  await openImport(page)
  await chooseFile(page, content)
  await expect(problems(page)).toContainText('Receipt E2E-TWICE was already imported')
  await expect(importButton(page)).toBeDisabled()
  expect(await stockOf(page, product.id)).toBe(6)
})

test('problems are listed by row, and fixing the file lets it through', async ({ page }) => {
  await createProduct(page, 'Е2Е Грешки', '5')
  const before = await salesTotal(page)

  await openImport(page)
  await chooseFile(page, `${HEADER}\nE2E-3;вчера;;Е2Е Грешки;1;\nE2E-4;${today()};;Няма такъв;1;`)

  await expect(dialog(page).getByRole('alert')).toContainText('2 problems found. Nothing was saved.')
  await expect(problems(page).getByRole('listitem').first()).toContainText('Row 2:')
  await expect(problems(page).getByRole('listitem').first()).toContainText('not a date')
  await expect(problems(page).getByRole('listitem').nth(1)).toContainText('Row 3:')
  await expect(problems(page).getByRole('listitem').nth(1)).toContainText("No product called 'Няма такъв'")
  await expect(importButton(page)).toBeDisabled()

  // The box is emptied after every choice, so the same file can be chosen again once it's fixed.
  await expect(dialog(page).getByLabel('CSV file')).toHaveValue('')

  await chooseFile(page, `${HEADER}\nE2E-5;${today()};;Е2Е Грешки;1;`)
  await expect(result(page)).toContainText('The file is fine')
  await expect(importButton(page)).toBeEnabled()
  expect(await salesTotal(page)).toBe(before)
})

test('more sold than the stock explains which product', async ({ page }) => {
  await createProduct(page, 'Е2Е Недостиг импорт', '2')
  await openImport(page)
  await chooseFile(page, `${HEADER}\nE2E-6;${today()};;Е2Е Недостиг импорт;9;`)
  await expect(problems(page)).toContainText("Only 2 of 'Е2Е Недостиг импорт' can be sold")
})

test('old history changes neither stock nor sales', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е История импорт', '10')
  const before = await salesTotal(page)

  await openImport(page)
  await dialog(page).getByRole('tab', { name: 'Old history' }).click()
  await expect(dialog(page).getByText('Your stock stays as it is')).toBeVisible()
  await chooseFile(page, `date;product;quantity\n01.03.2025;Е2Е История импорт;7\n02.03.2025;Е2Е История импорт;4`)

  await expect(result(page)).toContainText('Mar 1, 2025 – Mar 2, 2025')
  await importButton(page).click()
  await expect(page.getByText('2 rows imported')).toBeVisible()

  expect(await stockOf(page, product.id)).toBe(10)
  expect(await salesTotal(page)).toBe(before)
})

test('changing the mode checks the file again', async ({ page }) => {
  await createProduct(page, 'Е2Е Режим', '5')
  await openImport(page)
  await chooseFile(page, `date;product;quantity\n${today()};Е2Е Режим;1`)
  await expect(problems(page)).toContainText('Missing columns: receipt')

  await dialog(page).getByRole('tab', { name: 'Old history' }).click()
  await expect(result(page)).toContainText('The file is fine')
  await expect(importButton(page)).toBeEnabled()
})

test('a file in the old Windows encoding is understood', async ({ page }) => {
  await createProduct(page, 'Сирене импорт', '5')
  await openImport(page)
  await chooseFile(page, windows1251(`Бележка;Дата;Продукт;Количество\nE2E-7;${today()};Сирене импорт;1`))
  await expect(result(page)).toContainText('The file is fine')
})

test('a file over the limit is refused before it is sent', async ({ page }) => {
  await openImport(page)
  await chooseFile(page, Buffer.alloc(10_000_001, 'x'))
  await expect(dialog(page).getByText('This file is too big')).toBeVisible()
  await expect(importButton(page)).toBeDisabled()
})

test('the template can be downloaded and goes through the check', async ({ page }) => {
  await openImport(page)
  const downloading = page.waitForEvent('download')
  await dialog(page).getByRole('button', { name: 'Download a template' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('inventra-sales-template.csv')

  const content = readFileSync(await download.path())
  expect(content.toString('utf-8')).toContain(HEADER)
  await chooseFile(page, content)
  await expect(result(page)).toContainText('The file is fine')
  await expect(result(page)).toContainText('Products')
})
