import { expect, type Page, test } from '@playwright/test'

import { logInAsDemoOwner } from './helpers.ts'

const API = '/api/v1'

test.beforeEach(async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.goto('/inventory')
  await expect(page.getByRole('row').nth(1)).toBeVisible()
})

const dialog = (page: Page) => page.getByRole('dialog')
const row = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })
const picker = (page: Page) => dialog(page).getByRole('combobox', { name: 'Product' })

// Test data goes through the API with the logged-in browser's own cookie.
async function createProduct(page: Page, name: string, unit = 'pcs') {
  const response = await page.request.post(`${API}/products`, {
    data: { name, unit, purchase_price: '1.00', sale_price: '2.00' },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as { id: number }
}

async function receiveThroughApi(page: Page, productId: number, quantity: string) {
  const response = await page.request.post(`${API}/batches`, {
    data: { product_id: productId, quantity },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as { id: number }
}

async function openBatchAction(page: Page, name: string, action: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: action }).click()
}

// Finds the one batch of a product that was created through the API moments ago.
async function showOnly(page: Page, name: string) {
  await page.reload()
  await page.getByLabel('Search batches').fill(name)
  await expect(page.locator('tbody tr')).toHaveCount(1)
}

async function pickProduct(page: Page, name: string) {
  await picker(page).click()
  await page.getByPlaceholder('Search by name or barcode').fill(name)
  await page.getByRole('option', { name }).click()
}

test('batches come in shelf order, and the tabs show what needs attention', async ({ page }) => {
  // The demo's expired chicken comes first, then bread with one day left.
  await expect(page.locator('tbody tr').first()).toContainText('Пилешко филе')
  await expect(page.locator('tbody tr').first()).toContainText('Expired yesterday')
  await expect(page.locator('tbody tr').nth(1)).toContainText('Бял хляб')
  await expect(page.locator('tbody tr').nth(1)).toContainText('Expires tomorrow')

  await page.getByRole('tab', { name: 'Expiring soon' }).click()
  await expect(page).toHaveURL(/status=expiring/)
  await expect(row(page, 'Бял хляб')).toBeVisible()
  await expect(row(page, 'Пилешко филе')).toHaveCount(0)
  await expect(row(page, 'Сирене краве')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Expired' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)

  await page.reload()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(row(page, 'Пилешко филе')).toBeVisible()
})

test('weighed goods keep their decimals', async ({ page }) => {
  await page.getByLabel('Search batches').fill('Банани')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(row(page, 'Банани')).toContainText('14.5 kg')
  await expect(row(page, 'Банани')).toContainText('of 14.5 kg')
})

test('receiving goods adds a batch and raises the stock on the Products page', async ({ page }) => {
  await createProduct(page, 'Е2Е Доставка')

  await page.getByRole('button', { name: 'Receive goods' }).click()
  await expect(dialog(page).getByRole('button', { name: 'Receive goods' })).toBeDisabled()

  await pickProduct(page, 'Е2Е Доставка')
  await expect(picker(page)).toHaveText('Е2Е Доставка')
  await expect(dialog(page).getByLabel('Quantity (pcs)')).toBeVisible()
  await expect(dialog(page).getByLabel(/Purchase price/)).toHaveAttribute('placeholder', '1.00')

  await dialog(page).getByLabel('Quantity (pcs)').fill('12')
  await dialog(page).getByLabel('Lot number').fill('E2E-LOT-1')
  await dialog(page).getByLabel(/Purchase price/).fill('0.85')
  await dialog(page).getByRole('button', { name: 'Receive goods' }).click()

  await expect(dialog(page)).toBeHidden()
  await expect(page.getByText('12 pcs of Е2Е Доставка received')).toBeVisible()
  await expect(row(page, 'Е2Е Доставка')).toContainText('E2E-LOT-1')
  await expect(row(page, 'Е2Е Доставка')).toContainText('12 pcs')

  await page.goto('/products?q=Доставка')
  await expect(row(page, 'Е2Е Доставка')).toContainText('12 pcs')
})

test('half a piece is refused, but half a kilogram is fine', async ({ page }) => {
  await createProduct(page, 'Е2Е Парче')
  await createProduct(page, 'Е2Е На тегло', 'kg')

  await page.getByRole('button', { name: 'Receive goods' }).click()
  await pickProduct(page, 'Е2Е Парче')
  const quantity = dialog(page).getByLabel('Quantity (pcs)')
  await quantity.fill('1.5')
  await dialog(page).getByRole('button', { name: 'Receive goods' }).click()
  await expect(dialog(page)).toBeVisible()
  expect(await quantity.evaluate((input: HTMLInputElement) => input.validity.stepMismatch)).toBe(true)

  await pickProduct(page, 'Е2Е На тегло')
  await dialog(page).getByLabel('Quantity (kg)').fill('1.5')
  await dialog(page).getByRole('button', { name: 'Receive goods' }).click()
  await expect(page.getByText('1.5 kg of Е2Е На тегло received')).toBeVisible()
})

test('a scanner that presses Enter too early cannot pick the wrong product', async ({ page }) => {
  // Slow answers make the previous search's rows stay on screen for a moment.
  await page.route('**/api/v1/products?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600))
    await route.continue()
  })

  await page.getByRole('button', { name: 'Receive goods' }).click()
  await picker(page).click()
  await expect(page.getByRole('option').first()).toBeVisible()

  await page.getByPlaceholder('Search by name or barcode').fill('2000000000060')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('option', { name: 'Яйца' })).toBeVisible()
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(picker(page)).toContainText('Яйца')
})

test('writing off lowers the stock and an emptied batch leaves the list', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е Брак')
  await receiveThroughApi(page, product.id, '10')
  await showOnly(page, 'Е2Е Брак')

  await openBatchAction(page, 'Е2Е Брак', 'Write off')
  await expect(dialog(page).getByLabel('Quantity (pcs)')).toHaveValue('10')

  await dialog(page).getByLabel('Quantity (pcs)').fill('4')
  await dialog(page).getByRole('combobox', { name: 'Reason' }).click()
  await page.getByRole('option', { name: 'Other' }).click()
  await dialog(page).getByRole('button', { name: 'Write off' }).click()
  await expect(page.getByText('4 pcs of Е2Е Брак written off')).toBeVisible()
  await expect(row(page, 'Е2Е Брак')).toContainText('6 pcs')

  await openBatchAction(page, 'Е2Е Брак', 'Write off')
  await dialog(page).getByRole('button', { name: 'Write off' }).click()
  await expect(page.getByText('No batches found')).toBeVisible()

  await page.getByRole('tab', { name: 'All' }).click()
  await expect(row(page, 'Е2Е Брак')).toContainText('0 pcs')

  // An empty batch can't be written off, but it can be corrected and its history stays.
  await page.getByRole('button', { name: 'Actions for Е2Е Брак' }).click()
  await expect(page.getByRole('menuitem', { name: 'Write off' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Correct the count' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'History' })).toBeVisible()
})

test('a colleague writing off the same batch first gets a clear answer', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е Колега')
  const batch = await receiveThroughApi(page, product.id, '5')
  await showOnly(page, 'Е2Е Колега')

  await openBatchAction(page, 'Е2Е Колега', 'Write off')
  await expect(dialog(page).getByLabel('Quantity (pcs)')).toHaveValue('5')

  const colleague = await page.request.post(`${API}/batches/${batch.id}/waste`, {
    data: { quantity: '4', reason: 'damaged' },
  })
  expect(colleague.ok()).toBe(true)

  await dialog(page).getByRole('button', { name: 'Write off' }).click()
  await expect(dialog(page).getByText('Only 1 left in this batch')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(row(page, 'Е2Е Колега')).toContainText('1 pcs')
})

test('a correction takes what was counted and shows the difference', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е Броене', 'kg')
  await receiveThroughApi(page, product.id, '9.75')
  await showOnly(page, 'Е2Е Броене')

  await openBatchAction(page, 'Е2Е Броене', 'Correct the count')
  await expect(dialog(page).getByText('the system shows 9.75 kg')).toBeVisible()
  const save = dialog(page).getByRole('button', { name: 'Save correction' })
  await expect(save).toBeDisabled()

  await dialog(page).getByLabel('Counted quantity (kg)').fill('9.75')
  await expect(dialog(page).getByText('nothing to correct')).toBeVisible()
  await expect(save).toBeDisabled()

  await dialog(page).getByLabel('Counted quantity (kg)').fill('9.3')
  await expect(dialog(page).getByText('Difference: -0.45 kg')).toBeVisible()
  await dialog(page).getByLabel('Reason').fill('Stocktaking')
  await save.click()

  await expect(page.getByText('Е2Е Броене: stock corrected to 9.3 kg')).toBeVisible()
  await expect(row(page, 'Е2Е Броене')).toContainText('9.3 kg')
})

test('a correction counted before a colleague\'s change is refused, then works', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е Промяна')
  const batch = await receiveThroughApi(page, product.id, '10')
  await showOnly(page, 'Е2Е Промяна')

  await openBatchAction(page, 'Е2Е Промяна', 'Correct the count')
  await dialog(page).getByLabel('Counted quantity (pcs)').fill('8')
  await dialog(page).getByLabel('Reason').fill('Stocktaking')
  await expect(dialog(page).getByText('Difference: -2 pcs')).toBeVisible()

  const colleague = await page.request.post(`${API}/batches/${batch.id}/waste`, {
    data: { quantity: '1', reason: 'damaged' },
  })
  expect(colleague.ok()).toBe(true)

  await dialog(page).getByRole('button', { name: 'Save correction' }).click()
  await expect(dialog(page).getByText('This batch changed meanwhile, it now has 9')).toBeVisible()
  // The form catches up by itself: the same count now means a different difference.
  await expect(dialog(page).getByText('Difference: -1 pcs')).toBeVisible()

  await dialog(page).getByRole('button', { name: 'Save correction' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(row(page, 'Е2Е Промяна')).toContainText('8 pcs')
})

test('the history shows every change, who made it and why', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е История')
  const batch = await receiveThroughApi(page, product.id, '20')
  await page.request.post(`${API}/batches/${batch.id}/waste`, { data: { quantity: '3', reason: 'damaged' } })
  await page.request.post(`${API}/batches/${batch.id}/adjustments`, {
    data: { quantity_delta: '2', reason: 'Found behind the shelf' },
  })
  await showOnly(page, 'Е2Е История')

  await openBatchAction(page, 'Е2Е История', 'History')
  const lines = dialog(page).getByRole('listitem')
  await expect(lines).toHaveCount(3)
  await expect(lines.nth(0)).toContainText('Correction')
  await expect(lines.nth(0)).toContainText('Found behind the shelf')
  await expect(lines.nth(0)).toContainText('+2 pcs')
  await expect(lines.nth(1)).toContainText('Written off')
  await expect(lines.nth(1)).toContainText('Damaged')
  await expect(lines.nth(1)).toContainText('-3 pcs')
  await expect(lines.nth(2)).toContainText('Received')
  await expect(lines.nth(2)).toContainText('+20 pcs')
  await expect(lines.nth(2)).toContainText('Demo Owner')
  await expect(dialog(page).getByRole('button', { name: 'Show older' })).toHaveCount(0)
})

test('a sale shows in the history of the batch it came from', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е Продадено')
  await receiveThroughApi(page, product.id, '10')
  const sale = await page.request.post(`${API}/sales`, {
    data: { items: [{ product_id: product.id, quantity: '4' }] },
  })
  expect(sale.ok()).toBe(true)
  await showOnly(page, 'Е2Е Продадено')

  await expect(row(page, 'Е2Е Продадено')).toContainText('6 pcs')
  await openBatchAction(page, 'Е2Е Продадено', 'History')
  await expect(dialog(page).getByRole('listitem').first()).toContainText('Sold')
  await expect(dialog(page).getByRole('listitem').first()).toContainText('-4 pcs')
})

test('a long history loads in parts, newest first', async ({ page }) => {
  const product = await createProduct(page, 'Е2Е Дълга')
  const batch = await receiveThroughApi(page, product.id, '100')
  for (let count = 1; count <= 51; count++) {
    await page.request.post(`${API}/batches/${batch.id}/adjustments`, {
      data: { quantity_delta: '-1', reason: `Count ${count}` },
    })
  }
  await showOnly(page, 'Е2Е Дълга')

  await openBatchAction(page, 'Е2Е Дълга', 'History')
  const lines = dialog(page).getByRole('listitem')
  await expect(lines).toHaveCount(50)
  await expect(lines.first()).toContainText('Count 51')

  await dialog(page).getByRole('button', { name: 'Show older' }).click()
  await expect(lines).toHaveCount(52)
  await expect(lines.last()).toContainText('Received')
  await expect(dialog(page).getByRole('button', { name: 'Show older' })).toHaveCount(0)
})

test('the page stays usable after the batch menu opened a dialog', async ({ page }) => {
  await page.getByRole('button', { name: /^Actions for/ }).first().click()
  await page.getByRole('menuitem', { name: 'History' }).click()
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()

  await page.getByLabel('Search batches').fill('Банани')
  await expect(page.locator('tbody tr')).toHaveCount(1)
})

test('the unit of a product with batches cannot be changed', async ({ page }) => {
  await page.goto('/products?q=Банани')
  await page.getByRole('button', { name: 'Банани', exact: true }).click()
  await dialog(page).getByRole('combobox', { name: 'Sold by' }).click()
  await page.getByRole('option', { name: 'Pieces' }).click()
  await dialog(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog(page).getByText("'Банани' already has batches")).toBeVisible()
})

test('the products table sorts by stock', async ({ page }) => {
  await page.goto('/products')
  await page.getByRole('button', { name: 'Stock' }).click()
  await page.getByRole('button', { name: 'Stock' }).click()
  await expect(page).toHaveURL(/sort=stock/)
  await expect(page.getByRole('columnheader', { name: 'Stock' })).toHaveAttribute('aria-sort', 'descending')
  await expect(page.locator('tbody tr').first()).toContainText('Минерална вода')
})
