import { expect, type Page, test } from '@playwright/test'

import { logInAsDemoOwner } from './helpers.ts'

const API = '/api/v1'

test.beforeEach(async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 2 })).toBeVisible()
})

const tile = (page: Page, label: string) => page.getByRole('group', { name: label })
const attention = (page: Page) => page.getByRole('list', { name: 'Batches that need attention' })

function day(offset: number): string {
  const moment = new Date()
  moment.setDate(moment.getDate() + offset)
  const month = String(moment.getMonth() + 1).padStart(2, '0')
  const date = String(moment.getDate()).padStart(2, '0')
  return `${moment.getFullYear()}-${month}-${date}`
}

const money = (amount: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(Number(amount))

async function json<T>(page: Page, path: string): Promise<T> {
  return (await (await page.request.get(`${API}${path}`)).json()) as T
}

type Summary = { sales: number; revenue: string; profit: string }
type Stock = { stock_value: string; expired_value: string; expired_batches: number; expiring_batches: number }
type Day = { day: string; sales: number; revenue: string; profit: string }

test('the tiles show the same numbers as the API', async ({ page }) => {
  const stock = await json<Stock>(page, '/batches/summary')
  const todaySales = await json<Summary>(page, `/sales/summary?date_from=${day(0)}&date_to=${day(0)}`)

  await expect(tile(page, 'Revenue today')).toContainText(money(todaySales.revenue))
  await expect(tile(page, 'Stock value')).toContainText(money(stock.stock_value))
  await expect(tile(page, 'Expired stock')).toContainText(money(stock.expired_value))
  await expect(tile(page, 'Expired stock')).toContainText(`${stock.expired_batches} batch`)
  await expect(tile(page, 'Expiring soon')).toContainText(String(stock.expiring_batches))
})

test('the chart covers 30 days, and the table shows the same numbers', async ({ page }) => {
  const month = await json<Summary>(page, `/sales/summary?date_from=${day(-29)}&date_to=${day(0)}`)
  const days = await json<Day[]>(page, `/sales/daily?date_from=${day(-29)}&date_to=${day(0)}`)
  expect(days).toHaveLength(30)

  await expect(page.getByText(`Last 30 days: ${money(month.revenue)} revenue, ${money(month.profit)} profit`)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText('Revenue')
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText('Profit')
  // Two lines for the finished days, and two dashed ones for today, which isn't over yet.
  await expect(page.locator('.recharts-line-curve')).toHaveCount(4)
  await expect(page.locator('.recharts-line-curve[stroke-dasharray]')).toHaveCount(2)
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText('today so far')

  await page.getByRole('button', { name: 'Show as a table' }).click()
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(30)
  // Newest first, so yesterday is the second row.
  await expect(rows.nth(1)).toContainText(money(days[28].revenue))
  await expect(rows.nth(1)).toContainText(money(days[28].profit))

  await page.getByRole('button', { name: 'Hide the table' }).click()
  await expect(rows).toHaveCount(0)
})

test('hovering the chart shows every series of that day', async ({ page }) => {
  const days = await json<Day[]>(page, `/sales/daily?date_from=${day(-29)}&date_to=${day(0)}`)
  const chart = page.locator('.recharts-surface').first()
  await chart.scrollIntoViewIfNeeded()
  const box = await chart.boundingBox()
  if (!box) throw new Error('The chart is not on the page')

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const tooltip = page.locator('.recharts-tooltip-wrapper')
  await expect(tooltip).toContainText('Revenue')
  await expect(tooltip).toContainText('Profit')
  const text = await tooltip.innerText()
  expect(days.some((row) => text.includes(money(row.revenue)) && text.includes(money(row.profit)))).toBe(true)
})

test('needs attention lists expired goods first and leads to the batch', async ({ page }) => {
  await expect(attention(page).getByRole('listitem').first()).toContainText('Пилешко филе')
  await expect(attention(page).getByRole('listitem').first()).toContainText('Expired yesterday')
  await expect(attention(page)).toContainText('Expires tomorrow')

  await attention(page).getByRole('link', { name: /Пилешко филе/ }).click()
  await expect(page).toHaveURL(/\/inventory\?q=/)
  await expect(page.locator('tbody tr')).toHaveCount(1)
})

test('a new sale shows on the dashboard right away', async ({ page }) => {
  const before = await json<Summary>(page, `/sales/summary?date_from=${day(0)}&date_to=${day(0)}`)
  await expect(tile(page, 'Revenue today')).toContainText(money(before.revenue))

  await page.getByRole('link', { name: 'Sales', exact: true }).click()
  await page.getByRole('button', { name: 'New sale' }).first().click()
  await page.getByRole('dialog').getByRole('combobox').click()
  await page.getByPlaceholder('Search by name or barcode').fill('Минерална вода')
  await page.getByRole('option', { name: 'Минерална вода' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Record sale' }).click()
  await expect(page.getByText('Sale of €0.65 recorded')).toBeVisible()

  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(tile(page, 'Revenue today')).toContainText(money(Number(before.revenue) + 0.65))
  await expect(tile(page, 'Revenue today')).toContainText(`${before.sales + 1} sale`)
})
