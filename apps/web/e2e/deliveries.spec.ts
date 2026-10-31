import { expect, type Page, test } from '@playwright/test'

import { logInAsDemoOwner } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.goto('/deliveries')
  await expect(page.getByRole('row').nth(1)).toBeVisible()
})

const dialog = (page: Page) => page.getByRole('dialog')
const row = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text })

function inDays(days: number): string {
  const moment = new Date()
  moment.setDate(moment.getDate() + days)
  const month = String(moment.getMonth() + 1).padStart(2, '0')
  const date = String(moment.getDate()).padStart(2, '0')
  return `${moment.getFullYear()}-${month}-${date}`
}

// One product of its own for this whole file, so demo stock stays as the other files expect it.
// Created by the first test that needs it, and it builds up stock as the tests go on.
const PRODUCT = 'Е2Е Поръчана стока'

async function addDelivery(page: Page, product: string, quantity: string) {
  await page.getByRole('button', { name: 'New delivery' }).click()
  await dialog(page).getByRole('combobox', { name: 'Supplier' }).click()
  await page.getByRole('option', { name: 'Зелена долина (демо)' }).click()
  await dialog(page).getByLabel('Expected on').fill(inDays(1))
  await dialog(page).getByRole('combobox').filter({ hasText: 'Add a product' }).click()
  await page.getByPlaceholder('Search by name or barcode').fill(product)
  await page.getByRole('option', { name: product }).click()
  await dialog(page).getByLabel(`Quantity of ${product}`).fill(quantity)
  await dialog(page).getByRole('button', { name: 'Add delivery' }).click()
  await expect(dialog(page)).toHaveCount(0)
}

test('the list shows what is on the way, and which delivery is late', async ({ page }) => {
  await expect(row(page, 'Зелена долина (демо)')).toContainText('On the way')
  await expect(row(page, 'Ферма Слънце (демо)')).toContainText('Late')
})

test('a received delivery shows what arrived, with its invoice', async ({ page }) => {
  await page.getByRole('tab', { name: 'Received' }).click()
  await expect(page).toHaveURL(/status=received/)
  await row(page, 'Пекарна Изгрев (демо)').getByRole('cell').first().click()
  await expect(dialog(page)).toContainText('invoice DEMO-0001')
  await expect(dialog(page)).toContainText('Бял хляб 500 г')
  await expect(dialog(page).getByRole('button', { name: 'Receive goods' })).toHaveCount(0)
})

test('ordering changes nothing, and receiving brings the real goods into stock', async ({ page }) => {
  const created = await page.request.post('/api/v1/products', {
    data: { name: PRODUCT, purchase_price: '1.00', sale_price: '2.00' },
  })
  expect(created.ok()).toBe(true)

  await addDelivery(page, PRODUCT, '10')
  await expect(page.getByText('was added')).toBeVisible()

  await page.goto(`/products?q=${PRODUCT}`)
  await expect(row(page, PRODUCT).getByRole('cell').nth(7)).toHaveText('0 pcs')

  await page.goto('/deliveries')
  await row(page, PRODUCT).getByRole('button', { name: /Receive delivery/ }).click()
  await dialog(page).getByLabel('Invoice number').fill('INV-77')
  await dialog(page).getByLabel(`Arrived of ${PRODUCT}`).fill('8')
  await dialog(page).getByLabel(`Cost of ${PRODUCT}`).fill('1.25')
  await dialog(page).getByLabel(`Expiry date of ${PRODUCT}`).fill(inDays(30))
  await dialog(page).getByLabel(`Lot of ${PRODUCT}`).fill('LOT-5')
  await expect(dialog(page).getByLabel('Received total')).toContainText('10')
  await dialog(page).getByRole('button', { name: 'Receive goods' }).click()
  await expect(page.getByText('was received')).toBeVisible()
  await expect(row(page, PRODUCT)).toHaveCount(0)

  await page.getByRole('tab', { name: 'Received' }).click()
  await row(page, PRODUCT).getByRole('cell').first().click()
  await expect(dialog(page)).toContainText('invoice INV-77')
  await expect(dialog(page)).toContainText('8 pcs arrived, ordered 10 pcs')
  await expect(dialog(page)).toContainText('lot LOT-5')

  await page.goto(`/inventory?q=${PRODUCT}`)
  await expect(row(page, PRODUCT)).toContainText('8 pcs')
  await expect(row(page, PRODUCT)).toContainText('LOT-5')
})

test('goods that never came leave the fields empty, and all missing means cancel', async ({ page }) => {
  await addDelivery(page, PRODUCT, '4')
  await row(page, PRODUCT).getByRole('button', { name: /Receive delivery/ }).click()

  await dialog(page).getByLabel(`Arrived of ${PRODUCT}`).fill('0')
  await expect(dialog(page).getByLabel(`Cost of ${PRODUCT}`)).toBeDisabled()
  await expect(dialog(page).getByRole('button', { name: 'Receive goods' })).toBeDisabled()
  await expect(dialog(page)).toContainText('cancel the delivery instead')
})

test('cancelling asks once more, then the delivery leaves the list', async ({ page }) => {
  await row(page, PRODUCT).getByRole('cell').first().click()
  await dialog(page).getByRole('button', { name: 'Cancel delivery' }).click()
  await dialog(page).getByRole('button', { name: 'Keep it' }).click()
  await expect(dialog(page).getByRole('button', { name: 'Receive goods' })).toBeVisible()

  await dialog(page).getByRole('button', { name: 'Cancel delivery' }).click()
  await dialog(page).getByRole('button', { name: 'Yes, cancel this delivery' }).click()
  await expect(page.getByText('was cancelled')).toBeVisible()
  await expect(row(page, PRODUCT)).toHaveCount(0)

  await page.getByRole('tab', { name: 'Cancelled' }).click()
  await expect(row(page, PRODUCT)).toContainText('Cancelled')
})

test('someone else receiving it first stops the second person with a clear message', async ({ page }) => {
  await addDelivery(page, PRODUCT, '3')
  await row(page, PRODUCT).getByRole('button', { name: /Receive delivery/ }).click()
  await expect(dialog(page)).toBeVisible()

  const list = await (await page.request.get('/api/v1/deliveries?status=ordered')).json()
  const delivery = list.items[0]
  await page.request.post(`/api/v1/deliveries/${delivery.id}/receive`, {
    data: { items: [{ item_id: delivery.items[0].id, quantity: '3' }] },
  })

  await dialog(page).getByRole('button', { name: 'Receive goods' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('already received')

  // 8 from the first delivery and 3 from this one, not 3 twice.
  await page.goto(`/products?q=${PRODUCT}`)
  await expect(row(page, PRODUCT).getByRole('cell').nth(7)).toHaveText('11 pcs')
})
