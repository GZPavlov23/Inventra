import { readFileSync } from 'node:fs'

import { expect, type Page, test } from '@playwright/test'

import { logInAsDemoOwner } from './helpers.ts'

const API = '/api/v1'

type Line = {
  product: { name: string; unit: string; barcode: string | null }
  order: string
  cost: string
  unit_cost: string
  expiring_unsold: string
}
type Report = { items: Line[]; total_cost: string; buffer_share: string; products_checked: number }

test.beforeEach(async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.goto('/orders')
  await expect(page.getByRole('heading', { name: 'Orders', level: 2 })).toBeVisible()
  await expect(page.locator('tbody tr').first()).toBeVisible()
})

const tile = (page: Page, label: string) => page.getByRole('group', { name: label })
const money = (amount: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(Number(amount))

async function report(page: Page, days = 7): Promise<Report> {
  return (await (await page.request.get(`${API}/forecasts/orders?days=${days}`)).json()) as Report
}

async function downloaded(page: Page): Promise<{ name: string; text: string }> {
  const waiting = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download order' }).click()
  const file = await waiting
  return { name: file.suggestedFilename(), text: readFileSync(await file.path()).toString('utf-8') }
}

test('it is reached from the menu and shows the same order as the API', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Orders', exact: true }).click()
  await expect(page).toHaveURL('/orders')

  const order = await report(page)
  await expect(page.locator('tbody tr')).toHaveCount(order.items.length)
  await expect(page.locator('tbody tr').first()).toContainText(order.items[0].product.name)
  await expect(page.getByLabel(`Order of ${order.items[0].product.name}`)).toHaveValue(String(Number(order.items[0].order)))

  await expect(tile(page, 'Products to order')).toContainText(String(order.items.length))
  await expect(tile(page, 'Products to order')).toContainText(`Out of ${order.products_checked}`)
  await expect(tile(page, 'Estimated cost')).toContainText(money(order.total_cost))
  await expect(tile(page, 'Safety buffer')).toContainText(`${(Number(order.buffer_share) * 100).toFixed(0)}%`)
})

test('every line explains its number', async ({ page }) => {
  await expect(page.locator('tbody tr').first()).toContainText('Expected')
  await expect(page.locator('tbody tr').first()).toContainText('a buffer of')
  await expect(page.locator('tbody tr').first()).toContainText('of usable stock')
  await expect(page.getByText('a simple statistical model')).toBeVisible()
})

test('stock that will expire unsold is called out', async ({ page }) => {
  const order = await report(page)
  const risky = order.items.find((line) => Number(line.expiring_unsold) > 0)
  test.skip(!risky, 'The demo stock has nothing at risk today')
  await expect(page.getByRole('row').filter({ hasText: risky?.product.name })).toContainText('will expire before it sells')
})

test('changing a quantity changes the cost, and it can be undone', async ({ page }) => {
  const order = await report(page)
  const line = order.items[0]
  const input = page.getByLabel(`Order of ${line.product.name}`)

  await input.fill(String(Number(line.order) + 10))
  const added = Number(line.unit_cost) * 10
  await expect(tile(page, 'Estimated cost')).toContainText(money(Number(order.total_cost) + added))
  await expect(page.getByRole('row').filter({ hasText: line.product.name })).toContainText('Recommended:')

  await page.getByRole('button', { name: 'Back to the recommendation' }).click()
  await expect(input).toHaveValue(String(Number(line.order)))
  await expect(tile(page, 'Estimated cost')).toContainText(money(order.total_cost))
  await expect(page.getByRole('button', { name: 'Back to the recommendation' })).toHaveCount(0)
})

test('the order downloads with the changed quantities and without zero lines', async ({ page }) => {
  const order = await report(page)
  const [first, second] = order.items

  await page.getByLabel(`Order of ${first.product.name}`).fill('0')
  await page.getByLabel(`Order of ${second.product.name}`).fill('99')
  await expect(tile(page, 'Products to order')).toContainText(String(order.items.length - 1))

  const file = await downloaded(page)
  expect(file.name).toMatch(/^inventra-order-\d{4}-\d{2}-\d{2}\.csv$/)
  expect(file.text).toContain('product;barcode;quantity;unit;unit_cost;cost')
  expect(file.text).not.toContain(first.product.name)
  expect(file.text).toContain(`${second.product.name};`)
  expect(file.text).toContain(';99;')
})

test('a name that looks like a formula stays plain text in the file', async ({ page }) => {
  await page.route(`**${API}/forecasts/orders?days=7`, async (route) => {
    const order = (await (await route.fetch()).json()) as Report
    order.items[0].product.name = '=HYPERLINK("http://evil.example")'
    await route.fulfill({ json: order })
  })
  await page.reload()
  await expect(page.locator('tbody tr').first()).toContainText('HYPERLINK')

  const { text } = await downloaded(page)
  expect(text).toContain(`"'=HYPERLINK(""http://evil.example"")"`)
})

test('covering 14 days asks for more, and survives a reload', async ({ page }) => {
  const week = await report(page)
  const twoWeeks = await report(page, 14)
  expect(Number(twoWeeks.total_cost)).toBeGreaterThan(Number(week.total_cost))

  await page.getByRole('tab', { name: 'Cover 14 days' }).click()
  await expect(page).toHaveURL(/days=14/)
  await expect(tile(page, 'Estimated cost')).toContainText(money(twoWeeks.total_cost))

  await page.reload()
  await expect(page.getByRole('tab', { name: 'Cover 14 days' })).toHaveAttribute('aria-selected', 'true')
})

test('changing the period forgets quantities typed for the old one', async ({ page }) => {
  const line = (await report(page)).items[0]
  await page.getByLabel(`Order of ${line.product.name}`).fill('500')
  await page.getByRole('tab', { name: 'Cover 14 days' }).click()
  await expect(page.getByLabel(`Order of ${line.product.name}`)).not.toHaveValue('500')
})

test('on a phone the table fits', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  const table = page.locator('[data-slot="table-container"]').first()
  await expect(table).toBeVisible()
  expect(await table.evaluate((box) => box.scrollWidth - box.clientWidth)).toBeLessThanOrEqual(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
})
