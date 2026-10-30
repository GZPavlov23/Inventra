import { expect, type Page, test } from '@playwright/test'

import { logInAsDemoOwner } from './helpers.ts'

const API = '/api/v1'

test.beforeEach(async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.goto('/sales')
  await expect(page.getByRole('heading', { name: 'Sales', level: 2 })).toBeVisible()
})

const dialog = (page: Page) => page.getByRole('dialog')
const newSale = (page: Page) => page.getByRole('button', { name: 'New sale' }).first()
const cart = (page: Page) => dialog(page).getByRole('list', { name: 'Products in this sale' })
const tile = (page: Page, label: string) => page.getByRole('group', { name: label })

function inDays(days: number): string {
  const day = new Date()
  day.setDate(day.getDate() + days)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

const money = (amount: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(Number(amount))

async function createProduct(page: Page, name: string, overrides: Record<string, string> = {}) {
  const response = await page.request.post(`${API}/products`, {
    data: { name, purchase_price: '1.00', sale_price: '2.00', ...overrides },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as { id: number }
}

async function receive(page: Page, productId: number, quantity: string, extra: object = {}) {
  const response = await page.request.post(`${API}/batches`, {
    data: { product_id: productId, quantity, ...extra },
  })
  expect(response.ok()).toBe(true)
}

async function addToSale(page: Page, name: string) {
  await dialog(page).getByRole('combobox').click()
  await page.getByPlaceholder('Search by name or barcode').fill(name)
  await page.getByRole('option', { name }).click()
}

test('a sale takes the batch that expires first and shows what was earned', async ({ page }) => {
  const milk = await createProduct(page, 'Е2Е Продажба мляко')
  const bananas = await createProduct(page, 'Е2Е Продажба банани', { unit: 'kg', sale_price: '1.89' })
  await receive(page, milk.id, '2', { expiry_date: inDays(9), lot_code: 'LATER', purchase_price: '1.50' })
  await receive(page, milk.id, '1', { expiry_date: inDays(2), lot_code: 'SOONER', purchase_price: '1.00' })
  await receive(page, bananas.id, '5', { expiry_date: inDays(4) })

  await newSale(page).click()
  await expect(dialog(page).getByRole('button', { name: 'Record sale' })).toBeDisabled()

  await addToSale(page, 'Е2Е Продажба мляко')
  await dialog(page).getByLabel('Quantity of Е2Е Продажба мляко').fill('2')
  await expect(dialog(page).getByLabel('Sale total')).toHaveText('€4.00')

  // 0.750 × 1.89 is 1.4175, which is €1.42 on the server's receipt as well.
  await addToSale(page, 'Е2Е Продажба банани')
  await dialog(page).getByLabel('Quantity of Е2Е Продажба банани').fill('0.750')
  await expect(dialog(page).getByLabel('Sale total')).toHaveText('€5.42')

  // A discount for this sale only.
  await dialog(page).getByLabel('Price of Е2Е Продажба мляко').fill('1.75')
  await expect(dialog(page).getByLabel('Sale total')).toHaveText('€4.92')

  await dialog(page).getByRole('button', { name: 'Record sale' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.getByText('Sale of €4.92 recorded')).toBeVisible()

  const summary = await (await page.request.get(`${API}/sales/summary?date_from=${inDays(0)}&date_to=${inDays(0)}`)).json()
  await expect(tile(page, 'Sales')).toContainText(String(summary.sales))
  await expect(tile(page, 'Revenue')).toContainText(money(summary.revenue))
  await expect(tile(page, 'Profit')).toContainText(money(summary.profit))
  await expect(tile(page, 'Profit')).toContainText('Margin')

  const row = page.locator('tbody tr').first()
  await expect(row).toContainText('Е2Е Продажба банани × 0.75 kg')
  await expect(row).toContainText('€4.92')

  await row.getByRole('button').click()
  await expect(dialog(page).getByRole('heading', { name: /Sale #/ })).toBeVisible()
  const batches = dialog(page).getByRole('list', { name: 'Batches of Е2Е Продажба мляко' }).getByRole('listitem')
  await expect(batches).toHaveCount(2)
  await expect(batches.nth(0)).toContainText('1 pcs from the batch')
  await expect(batches.nth(0)).toContainText('lot SOONER')
  await expect(batches.nth(1)).toContainText('1 pcs from the batch')
  await expect(batches.nth(1)).toContainText('lot LATER')
  // Cost is 1.00 + 1.50 from the milk's real batches, plus the bananas.
  await expect(dialog(page).getByText('Cost of the goods')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/products?q=Продажба мляко')
  await expect(page.getByRole('row').filter({ hasText: 'Е2Е Продажба мляко' })).toContainText('1 pcs')
})

test('the total in the form matches the receipt to the cent', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е Стотинка', { unit: 'kg', sale_price: '1.00' })
  await receive(page, product.id, '5')

  // 1.005 can't be stored exactly as a binary float, so plain arithmetic would give €1.00.
  await newSale(page).click()
  await addToSale(page, 'Е2Е Стотинка')
  await dialog(page).getByLabel('Quantity of Е2Е Стотинка').fill('1.005')
  await expect(dialog(page).getByLabel('Sale total')).toHaveText('€1.01')

  await dialog(page).getByRole('button', { name: 'Record sale' }).click()
  await expect(page.getByText('Sale of €1.01 recorded')).toBeVisible()
})

test('adding the same product again raises its quantity, and lines can be removed', async ({ page }) => {
  await receive(page, (await createProduct(page, 'Е2Е Кошница')).id, '10')

  await newSale(page).click()
  await addToSale(page, 'Е2Е Кошница')
  await addToSale(page, 'Е2Е Кошница')
  await expect(cart(page).getByRole('listitem')).toHaveCount(1)
  await expect(dialog(page).getByLabel('Quantity of Е2Е Кошница')).toHaveValue('2')

  await dialog(page).getByRole('button', { name: 'Remove Е2Е Кошница' }).click()
  await expect(cart(page)).toHaveCount(0)
  await expect(dialog(page).getByRole('button', { name: 'Record sale' })).toBeDisabled()
})

test('a scanned barcode adds the product', async ({ page }) => {
  await newSale(page).click()
  await dialog(page).getByRole('combobox').click()
  await page.getByPlaceholder('Search by name or barcode').fill('2000000000060')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(cart(page)).toContainText('Яйца')
})

test('more than the stock is refused and the cart stays as it was', async ({ page }) => {
  await receive(page, (await createProduct(page, 'Е2Е Малко')).id, '2')
  const before = await (await page.request.get(`${API}/sales?limit=1`)).json()

  await newSale(page).click()
  await addToSale(page, 'Е2Е Малко')
  await dialog(page).getByLabel('Quantity of Е2Е Малко').fill('3')
  await dialog(page).getByRole('button', { name: 'Record sale' }).click()

  await expect(dialog(page).getByText("Only 2 of 'Е2Е Малко' can be sold")).toBeVisible()
  await expect(dialog(page).getByLabel('Quantity of Е2Е Малко')).toHaveValue('3')
  const after = await (await page.request.get(`${API}/sales?limit=1`)).json()
  expect(after.total).toBe(before.total)

  // The error goes away as soon as the sale is corrected.
  await dialog(page).getByLabel('Quantity of Е2Е Малко').fill('2')
  await expect(dialog(page).getByText('can be sold')).toBeHidden()
  await dialog(page).getByRole('button', { name: 'Record sale' }).click()
  await expect(page.getByText('Sale of €4.00 recorded')).toBeVisible()
})

test('expired goods cannot be sold', async ({ page }) => {
  await newSale(page).click()
  await addToSale(page, 'Пилешко филе')
  await dialog(page).getByRole('button', { name: 'Record sale' }).click()
  await expect(dialog(page).getByText("Only 0 of 'Пилешко филе 500 г' can be sold")).toBeVisible()
})

test('half a piece is stopped by the form', async ({ page }) => {
  await receive(page, (await createProduct(page, 'Е2Е Цяло')).id, '5')
  await newSale(page).click()
  await addToSale(page, 'Е2Е Цяло')
  const quantity = dialog(page).getByLabel('Quantity of Е2Е Цяло')
  await quantity.fill('1.5')
  await dialog(page).getByRole('button', { name: 'Record sale' }).click()
  await expect(dialog(page)).toBeVisible()
  expect(await quantity.evaluate((input: HTMLInputElement) => input.validity.stepMismatch)).toBe(true)
})

test('the period is kept in the address and decides which days are asked for', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е Период')
  await receive(page, product.id, '5')
  const sale = await page.request.post(`${API}/sales`, {
    data: { items: [{ product_id: product.id, quantity: '1' }] },
  })
  expect(sale.ok()).toBe(true)
  await page.reload()
  await expect(page.locator('tbody tr').first()).toContainText('Е2Е Период')

  const lastThirtyDays = page.waitForRequest(
    `**${API}/sales/summary?date_from=${inDays(-29)}&date_to=${inDays(0)}`,
  )
  await page.getByRole('tab', { name: 'Last 30 days' }).click()
  await lastThirtyDays
  await expect(page).toHaveURL(/period=30d/)
  await expect(page.getByRole('tab', { name: 'Last 30 days' })).toHaveAttribute('aria-selected', 'true')

  await page.reload()
  await expect(page.getByRole('tab', { name: 'Last 30 days' })).toHaveAttribute('aria-selected', 'true')

  const lastSevenDays = page.waitForRequest(
    `**${API}/sales?date_from=${inDays(-6)}&date_to=${inDays(0)}&limit=20&offset=0`,
  )
  await page.getByRole('tab', { name: 'Last 7 days' }).click()
  await lastSevenDays

  const allSales = page.waitForRequest(`**${API}/sales/summary?`)
  await page.getByRole('tab', { name: 'All' }).click()
  await allSales

  await page.getByRole('tab', { name: 'Today' }).click()
  await expect(page).not.toHaveURL(/period=/)
})
